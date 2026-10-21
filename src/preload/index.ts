import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  InstallEvent,
  OcrApi,
  ReviewEvent,
  SaveFileRequest,
  SavePreferencesRequest,
  SaveProviderRequest,
  TestConnectionRequest
} from '@shared/types'

const api: OcrApi = {
  env: {
    check: (force) => ipcRenderer.invoke('env:check', force),
    install: async (onEvent: (event: InstallEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: InstallEvent) => onEvent(payload)
      ipcRenderer.on('env:installEvent', listener)
      try {
        return (await ipcRenderer.invoke('env:install')) as boolean
      } finally {
        ipcRenderer.removeListener('env:installEvent', listener)
      }
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', patch),
    pickDirectory: () => ipcRenderer.invoke('settings:pickDirectory'),
    addProject: (dir: string) => ipcRenderer.invoke('settings:addProject', dir),
    removeProject: (dir: string) => ipcRenderer.invoke('settings:removeProject', dir)
  },
  git: {
    status: (repo: string) => ipcRenderer.invoke('git:status', repo),
    branches: (repo: string) => ipcRenderer.invoke('git:branches', repo),
    commits: (repo: string, limit?: number) => ipcRenderer.invoke('git:commits', repo, limit)
  },
  config: {
    read: () => ipcRenderer.invoke('config:read'),
    saveProvider: (req: SaveProviderRequest) => ipcRenderer.invoke('config:saveProvider', req),
    savePreferences: (req: SavePreferencesRequest) =>
      ipcRenderer.invoke('config:savePreferences', req),
    saveRaw: (json: string) => ipcRenderer.invoke('config:saveRaw', json),
    renameCustomProvider: (oldName: string, newName: string) =>
      ipcRenderer.invoke('config:renameCustomProvider', oldName, newName),
    migrateCustomProvider: (name: string) =>
      ipcRenderer.invoke('config:migrateCustomProvider', name),
    testConnection: (req?: TestConnectionRequest) =>
      ipcRenderer.invoke('config:testConnection', req),
    providers: () => ipcRenderer.invoke('config:providers')
  },
  review: {
    start: (req) => ipcRenderer.invoke('review:start', req),
    cancel: (runId: string) => ipcRenderer.invoke('review:cancel', runId),
    preview: (req) => ipcRenderer.invoke('review:preview', req),
    onEvent: (cb: (event: ReviewEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ReviewEvent) => cb(payload)
      ipcRenderer.on('review:event', listener)
      return () => ipcRenderer.removeListener('review:event', listener)
    }
  },
  sessions: {
    list: (repo: string) => ipcRenderer.invoke('sessions:list', repo),
    show: (repo: string, id: string) => ipcRenderer.invoke('sessions:show', repo, id),
    comments: (repo: string, id: string) =>
      ipcRenderer.invoke('sessions:comments', repo, id),
    compare: (repo: string, before: string, after: string) =>
      ipcRenderer.invoke('sessions:compare', repo, before, after),
    remove: (id: string) => ipcRenderer.invoke('sessions:remove', id),
    exportHtml: (repo: string, id: string) =>
      ipcRenderer.invoke('sessions:exportHtml', repo, id)
  },
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
    revealPath: (path: string) => ipcRenderer.invoke('shell:revealPath', path),
    openInEditor: (repo: string, file: string, line?: number) =>
      ipcRenderer.invoke('shell:openInEditor', repo, file, line),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    copyText: (text: string) => ipcRenderer.invoke('shell:copyText', text),
    saveFile: (req: SaveFileRequest) => ipcRenderer.invoke('shell:saveFile', req)
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    cliPath: () => ipcRenderer.invoke('app:cliPath'),
    openSessionsFolder: () => ipcRenderer.invoke('app:openSessionsFolder'),
    openConfigFolder: () => ipcRenderer.invoke('app:openConfigFolder')
  }
}

contextBridge.exposeInMainWorld('ocr', api)
