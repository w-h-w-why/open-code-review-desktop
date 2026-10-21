import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import providerCatalog from '@shared/providers.json'
import type {
  OcrConfigView,
  ProviderConfigView,
  ProviderInfo,
  SavePreferencesRequest,
  SaveProviderRequest,
  TestConnectionResult
} from '@shared/types'
import { execFile, extractCliError, ocrConfigPath, resolveCli } from './cli'

type RawConfig = Record<string, any>

const SECRET_SUFFIX = /(api_key|auth_token)$/i

export function readRawConfig(): RawConfig {
  const path = ocrConfigPath()
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RawConfig
  } catch {
    return {}
  }
}

export function writeRawConfig(raw: RawConfig): void {
  const path = ocrConfigPath()
  mkdirSync(join(path, '..'), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, path)
}

function mask(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}

function maskDeep(value: unknown, key = ''): unknown {
  if (SECRET_SUFFIX.test(key)) return mask(value)
  if (Array.isArray(value)) return value.map((v) => maskDeep(v))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskDeep(v, k)
    }
    return out
  }
  return value
}

function providerView(entry: RawConfig | undefined, custom: boolean): ProviderConfigView {
  const rawKey = entry?.api_key
  return {
    api_key: mask(rawKey),
    api_key_set: typeof rawKey === 'string' && rawKey.trim().length > 0,
    base_url: custom ? entry?.url : entry?.base_url,
    protocol: entry?.protocol
  }
}

export function readConfigView(): OcrConfigView {
  const path = ocrConfigPath()
  const exists = existsSync(path)
  const raw = readRawConfig()
  const providers: Record<string, ProviderConfigView> = {}
  for (const [name, entry] of Object.entries(raw.providers ?? {})) {
    providers[name] = providerView(entry as RawConfig, false)
  }
  const customProviders: Record<string, ProviderConfigView> = {}
  for (const [name, entry] of Object.entries(raw.custom_providers ?? {})) {
    customProviders[name] = providerView(entry as RawConfig, true)
  }

  return {
    path,
    exists,
    provider: typeof raw.provider === 'string' ? raw.provider : '',
    model: typeof raw.model === 'string' ? raw.model : '',
    language: typeof raw.language === 'string' ? raw.language : 'English',
    effort: typeof raw.effort === 'string' ? raw.effort : '',
    maxTokens: typeof raw.max_tokens === 'number' ? raw.max_tokens : 0,
    providers,
    customProviders,
    llm: raw.llm,
    raw: maskDeep(raw) as Record<string, unknown>
  }
}

export function listProviders(): ProviderInfo[] {
  return providerCatalog as ProviderInfo[]
}

function applyProvider(raw: RawConfig, req: SaveProviderRequest): RawConfig {
  const next: RawConfig = { ...raw }
  next.provider = req.provider
  if (req.model?.trim()) next.model = req.model.trim()
  else delete next.model

  const name = req.provider.trim()
  const key = req.apiKey?.trim()

  if (req.custom) {
    const existing = (next.custom_providers?.[name] ?? {}) as RawConfig
    const entry: RawConfig = {
      ...existing,
      url: req.baseURL?.trim() || existing.url,
      protocol: req.protocol?.trim() || existing.protocol || 'openai'
    }
    if (key) entry.api_key = key
    next.custom_providers = { ...(next.custom_providers ?? {}), [name]: entry }
    if (next.providers && Object.keys(next.providers).length === 0) delete next.providers
  } else {
    const existing = (next.providers?.[name] ?? {}) as RawConfig
    const entry: RawConfig = { ...existing }
    if (key) entry.api_key = key
    next.providers = { ...(next.providers ?? {}), [name]: entry }
  }
  return next
}

export function saveProvider(req: SaveProviderRequest): OcrConfigView {
  if (!req.provider?.trim()) throw new Error('请选择一个模型服务商')
  const name = req.provider.trim()
  if (req.custom && listProviders().some((provider) => provider.name === name)) {
    throw new Error(
      `“${name}” 是内置服务商名称，自定义配置不会生效。请改用其他名称，例如 ${name}-custom，或直接选择内置服务商。`
    )
  }
  const raw = applyProvider(readRawConfig(), req)
  writeRawConfig(raw)
  return readConfigView()
}

/** Rename a custom provider in place, preserving its URL, protocol and key. */
export function renameCustomProvider(oldName: string, newName: string): OcrConfigView {
  const raw = readRawConfig()
  const target = newName.trim()
  if (!target) throw new Error('请填写新的服务商名称')
  if (!raw.custom_providers?.[oldName]) throw new Error(`没有找到自定义服务商 ${oldName}`)
  if (listProviders().some((provider) => provider.name === target)) {
    throw new Error(`“${target}” 是内置服务商名称，请换一个名称`)
  }
  if (raw.custom_providers[target]) throw new Error(`自定义服务商 “${target}” 已存在`)

  raw.custom_providers[target] = raw.custom_providers[oldName]
  delete raw.custom_providers[oldName]
  if (raw.provider === oldName) raw.provider = target
  writeRawConfig(raw)
  return readConfigView()
}

/** Move a custom provider's key onto the built-in provider with the same name. */
export function migrateCustomProvider(name: string): OcrConfigView {
  const raw = readRawConfig()
  const custom = raw.custom_providers?.[name] as RawConfig | undefined
  if (!custom) throw new Error(`没有找到自定义服务商 ${name}`)
  if (!listProviders().some((provider) => provider.name === name)) {
    throw new Error(`${name} 不是内置服务商，无法迁移`)
  }
  const existing = (raw.providers?.[name] ?? {}) as RawConfig
  const merged: RawConfig = { ...existing }
  if (custom.api_key) merged.api_key = custom.api_key
  raw.providers = { ...(raw.providers ?? {}), [name]: merged }
  delete raw.custom_providers[name]
  if (Object.keys(raw.custom_providers).length === 0) delete raw.custom_providers
  raw.provider = name
  writeRawConfig(raw)
  return readConfigView()
}

export function savePreferences(req: SavePreferencesRequest): OcrConfigView {
  const raw = readRawConfig()
  if (req.language !== undefined) {
    if (req.language.trim()) raw.language = req.language.trim()
    else delete raw.language
  }
  if (req.effort !== undefined) {
    if (req.effort.trim()) raw.effort = req.effort.trim()
    else delete raw.effort
  }
  if (req.maxTokens !== undefined) {
    if (req.maxTokens > 0) raw.max_tokens = req.maxTokens
    else delete raw.max_tokens
  }
  writeRawConfig(raw)
  return readConfigView()
}

export function saveRawConfigJson(json: string): OcrConfigView {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error(`JSON 格式错误：${err instanceof Error ? err.message : String(err)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('配置文件必须是一个 JSON 对象')
  }
  writeRawConfig(parsed as RawConfig)
  return readConfigView()
}

export async function testConnection(draft?: SaveProviderRequest): Promise<TestConnectionResult> {
  const cli = resolveCli()
  let tempHome: string | null = null
  let env = process.env

  try {
    if (draft) {
      const raw = applyProvider(readRawConfig(), draft)
      tempHome = mkdtempSync(join(tmpdir(), 'ocr-desktop-test-'))
      const dir = join(tempHome, '.opencodereview')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'config.json'), JSON.stringify(raw, null, 2), {
        encoding: 'utf8',
        mode: 0o600
      })
      env = {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome
      }
    }

    const result = await execFile(cli, ['llm', 'test'], {
      env,
      timeoutMs: 120_000
    })

    if (result.code === 0) {
      const output = result.stdout.trim()
      const successLine = output
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .find((l) => l.startsWith('✓'))
      return { ok: true, message: successLine || '连接成功', output }
    }

    const message = extractCliError(result.stderr) || result.error || `测试失败（退出码 ${result.code}）`
    return { ok: false, message, output: `${result.stdout}\n${result.stderr}`.trim() }
  } finally {
    if (tempHome) {
      try {
        rmSync(tempHome, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
  }
}
