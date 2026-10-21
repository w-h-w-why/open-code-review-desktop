import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve as resolvePath } from 'node:path'
import type {
  AppInfo,
  AppSettings,
  EnvCheck,
  InstallEvent,
  PreviewResponse,
  ReviewEvent,
  ReviewRequest,
  SaveFileRequest,
  SaveFileResult,
  SavePreferencesRequest,
  SaveProviderRequest,
  StartReviewResponse,
  TestConnectionRequest
} from '@shared/types'
import {
  cancelRun,
  execFile,
  extractCliError,
  killAllRuns,
  ocrConfigPath,
  ocrVersion,
  previewReview,
  resetCliCache,
  resolveCli,
  sessionsRoot,
  startReview,
  stripAnsi
} from './services/cli'
import {
  listProviders,
  migrateCustomProvider,
  readConfigView,
  renameCustomProvider,
  savePreferences,
  saveProvider,
  saveRawConfigJson,
  testConnection
} from './services/config'
import { getGitStatus, listBranches, listCommits, resolveRepoRoot } from './services/git'
import {
  compareSessions,
  exportSessionHtml,
  listSessions,
  removeSession,
  sessionComments,
  showSession
} from './services/sessions'
import {
  addRecentProject,
  readSettings,
  removeRecentProject,
  saveSettings
} from './services/settings'

let mainWindow: BrowserWindow | null = null

// Opt-in CDP endpoint for UI verification during development.
if (process.env.OCR_DESKTOP_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.OCR_DESKTOP_DEBUG_PORT)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 700,
    show: false,
    title: 'OpenCodeReview',
    backgroundColor: '#0f1412',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function firstLine(text: string): string | undefined {
  const line = stripAnsi(text).trim().split(/\r?\n/)[0]?.trim()
  return line || undefined
}

async function probe(cmd: string): Promise<{ ok: boolean; version?: string }> {
  const result = await execFile(cmd, ['--version'], { timeoutMs: 12_000 })
  if (result.error || result.code !== 0) return { ok: false }
  return { ok: true, version: firstLine(result.stdout) }
}

async function checkEnvironment(force = false): Promise<EnvCheck> {
  if (force) resetCliCache()
  const settings = readSettings()
  const [node, npm, git, ocr] = await Promise.all([
    probe('node'),
    probe('npm'),
    probe('git'),
    ocrVersion(settings.cliPath || undefined)
  ])
  const config = ocrConfigPath()
  return {
    node,
    npm,
    git,
    ocr,
    ocrConfigPath: config,
    hasConfig: existsSync(config),
    platform: `${process.platform}/${process.arch}`
  }
}

function splitToLines(chunk: string, state: { rest: string }): string[] {
  const combined = state.rest + chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = combined.split('\n')
  state.rest = parts.pop() ?? ''
  return parts.filter((l) => l.trim().length > 0)
}

async function installCli(sender: Electron.WebContents): Promise<boolean> {
  const state = { rest: '' }
  const emit = (line: string, level: 'info' | 'error' = 'info', extra: Partial<InstallEvent> = {}) => {
    if (!sender.isDestroyed()) sender.send('env:installEvent', { line, level, ...extra } satisfies InstallEvent)
  }

  emit('$ npm install -g @alibaba-group/open-code-review --no-progress')
  const result = await execFile(
    'npm',
    ['install', '-g', '@alibaba-group/open-code-review', '--loglevel', 'http', '--no-progress'],
    {
      env: { ...process.env, npm_config_progress: 'false', npm_config_color: 'false' },
      timeoutMs: 15 * 60_000,
      onStdout: (chunk) => {
        for (const line of splitToLines(chunk, state)) emit(line)
      },
      onStderr: (chunk) => {
        for (const line of splitToLines(chunk, state)) emit(line)
      }
    }
  )
  if (state.rest.trim()) emit(state.rest)
  resetCliCache()

  const ok = result.code === 0 && (await ocrVersion()).ok
  if (!ok) {
    emit(
      extractCliError(result.stderr) ||
        result.error ||
        `安装失败（退出码 ${result.code ?? '未知'}）`,
      'error'
    )
  } else {
    emit('安装完成，ocr 命令已可用。', 'info')
  }
  emit(ok ? 'done' : 'failed', ok ? 'info' : 'error', { done: true, ok })
  return ok
}

async function pickProjectDirectory(): Promise<string | null> {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 Git 仓库',
    properties: ['openDirectory'],
    buttonLabel: '打开仓库'
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

async function addProject(dir: string): Promise<{ root: string; settings: AppSettings }> {
  const root = await resolveRepoRoot(dir)
  if (!root) throw new Error('所选目录不是 Git 仓库')
  return { root, settings: addRecentProject(root) }
}

async function openInEditor(
  repo: string,
  file: string,
  line?: number
): Promise<boolean> {
  const abs = isAbsolute(file) ? file : resolvePath(repo, file)
  if (!existsSync(abs)) {
    shell.showItemInFolder(abs)
    return false
  }

  const settings = readSettings()
  const candidates =
    settings.editorCommand && settings.editorCommand !== 'auto'
      ? [settings.editorCommand]
      : ['code', 'cursor', 'windsurf', 'idea', 'webstorm', 'subl']

  for (const editor of candidates) {
    const args =
      editor === 'idea' || editor === 'webstorm'
        ? line
          ? ['--line', String(line), abs]
          : [abs]
        : line
          ? ['-g', `${abs}:${line}`]
          : [abs]
    const result = await execFile(editor, args, { timeoutMs: 8_000 })
    if (result.code === 0 && !result.error) return true
  }

  const err = await shell.openPath(abs)
  return err === ''
}

function registerIpc(): void {
  ipcMain.handle('env:check', (_event, force?: boolean) => checkEnvironment(Boolean(force)))

  ipcMain.handle('env:install', async (event) => installCli(event.sender))

  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:save', (_event, patch: Partial<AppSettings>) => saveSettings(patch))
  ipcMain.handle('settings:pickDirectory', () => pickProjectDirectory())
  ipcMain.handle('settings:addProject', (_event, dir: string) => addProject(dir))
  ipcMain.handle('settings:removeProject', (_event, dir: string) => removeRecentProject(dir))

  ipcMain.handle('git:status', (_event, repo: string) => getGitStatus(repo))
  ipcMain.handle('git:branches', (_event, repo: string) => listBranches(repo))
  ipcMain.handle('git:commits', (_event, repo: string, limit?: number) =>
    listCommits(repo, limit)
  )

  ipcMain.handle('config:read', () => readConfigView())
  ipcMain.handle('config:saveProvider', (_event, req: SaveProviderRequest) => saveProvider(req))
  ipcMain.handle('config:savePreferences', (_event, req: SavePreferencesRequest) =>
    savePreferences(req)
  )
  ipcMain.handle('config:saveRaw', (_event, json: string) => saveRawConfigJson(json))
  ipcMain.handle('config:renameCustomProvider', (_event, oldName: string, newName: string) =>
    renameCustomProvider(oldName, newName)
  )
  ipcMain.handle('config:migrateCustomProvider', (_event, name: string) =>
    migrateCustomProvider(name)
  )
  ipcMain.handle('config:testConnection', (_event, req?: TestConnectionRequest) => {
    const settings = readSettings()
    return testConnection(req?.draft, settings.cliPath || undefined)
  })
  ipcMain.handle('config:providers', () => listProviders())

  ipcMain.handle(
    'review:start',
    (event, req: ReviewRequest): StartReviewResponse => {
      const settings = readSettings()
      const sender = event.sender
      const emit = (reviewEvent: ReviewEvent) => {
        if (!sender.isDestroyed()) sender.send('review:event', reviewEvent)
      }
      const { runId } = startReview(req, emit, settings.cliPath || undefined)
      return { runId }
    }
  )
  ipcMain.handle('review:cancel', (_event, runId: string) => cancelRun(runId))
  ipcMain.handle('review:preview', (_event, req: ReviewRequest): Promise<PreviewResponse> => {
    const settings = readSettings()
    return previewReview(req, settings.cliPath || undefined)
  })

  ipcMain.handle('sessions:list', (_event, repo: string) => {
    const settings = readSettings()
    return listSessions(repo, settings.cliPath || undefined)
  })
  ipcMain.handle('sessions:show', (_event, repo: string, id: string) => {
    const settings = readSettings()
    return showSession(repo, id, settings.cliPath || undefined)
  })
  ipcMain.handle('sessions:comments', (_event, repo: string, id: string) => {
    const settings = readSettings()
    return sessionComments(repo, id, settings.cliPath || undefined)
  })
  ipcMain.handle('sessions:compare', (_event, repo: string, before: string, after: string) => {
    const settings = readSettings()
    return compareSessions(repo, before, after, settings.cliPath || undefined)
  })
  ipcMain.handle('sessions:remove', (_event, id: string) => {
    const settings = readSettings()
    return removeSession(id, settings.cliPath || undefined)
  })
  ipcMain.handle('sessions:exportHtml', async (_event, repo: string, id: string) => {
    if (!mainWindow) return { saved: false }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出会话为 HTML',
      defaultPath: `opencodereview-${id}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })
    if (result.canceled || !result.filePath) return { saved: false }
    const settings = readSettings()
    await exportSessionHtml(repo, id, result.filePath, settings.cliPath || undefined)
    return { saved: true, path: result.filePath }
  })

  ipcMain.handle('shell:openPath', async (_event, path: string) => {
    await shell.openPath(path)
  })
  ipcMain.handle('shell:revealPath', (_event, path: string) => {
    shell.showItemInFolder(path)
  })
  ipcMain.handle('shell:openInEditor', (_event, repo: string, file: string, line?: number) =>
    openInEditor(repo, file, line)
  )
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle('shell:copyText', (_event, text: string) => {
    clipboard.writeText(text)
  })
  ipcMain.handle(
    'shell:saveFile',
    async (_event, req: SaveFileRequest): Promise<SaveFileResult> => {
      if (!mainWindow) return { saved: false }
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '保存文件',
        defaultPath: req.defaultName,
        filters: req.filters
      })
      if (result.canceled || !result.filePath) return { saved: false }
      writeFileSync(result.filePath, req.content, 'utf8')
      return { saved: true, path: result.filePath }
    }
  )

  ipcMain.handle('app:info', (): AppInfo => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      userData: app.getPath('userData'),
      sessionsRoot: sessionsRoot()
    }
  })
  ipcMain.handle('app:openSessionsFolder', async () => {
    const root = sessionsRoot()
    if (!existsSync(root)) mkdirSync(root, { recursive: true })
    await shell.openPath(root)
  })
  ipcMain.handle('app:openConfigFolder', async () => {
    const dir = dirname(ocrConfigPath())
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })

  // Keep the resolved CLI visible to the renderer for troubleshooting.
  ipcMain.handle('app:cliPath', () => resolveCli(readSettings().cliPath || undefined))
}

app.whenReady().then(() => {
  app.setAppUserModelId('ai.opencodereview.desktop')
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  killAllRuns()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  killAllRuns()
})
