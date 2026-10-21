import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings } from '@shared/types'

const defaults: AppSettings = {
  cliPath: '',
  recentProjects: [],
  defaultConcurrency: 8,
  defaultEffort: '',
  editorCommand: 'auto',
  autoRefreshGit: true
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function readSettings(): AppSettings {
  try {
    const path = settingsPath()
    if (!existsSync(path)) return { ...defaults }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppSettings>
    return {
      ...defaults,
      ...parsed,
      recentProjects: Array.isArray(parsed.recentProjects) ? parsed.recentProjects : []
    }
  } catch {
    return { ...defaults }
  }
}

export function writeSettings(settings: AppSettings): AppSettings {
  const path = settingsPath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
  renameSync(tmp, path)
  return settings
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = readSettings()
  const next: AppSettings = {
    ...current,
    ...patch,
    recentProjects: patch.recentProjects
      ? Array.from(new Set(patch.recentProjects.filter(Boolean)))
      : current.recentProjects
  }
  return writeSettings(next)
}

export function addRecentProject(dir: string): AppSettings {
  const current = readSettings()
  const recentProjects = [dir, ...current.recentProjects.filter((p) => p !== dir)].slice(0, 24)
  return writeSettings({ ...current, recentProjects })
}

export function removeRecentProject(dir: string): AppSettings {
  const current = readSettings()
  return writeSettings({
    ...current,
    recentProjects: current.recentProjects.filter((p) => p !== dir)
  })
}
