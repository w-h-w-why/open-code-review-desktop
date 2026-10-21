import spawn from 'cross-spawn'
import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type {
  PreviewResponse,
  ReviewEvent,
  ReviewRequest,
  ReviewResult,
  RunMeta
} from '@shared/types'

const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g

export function stripAnsi(input: string): string {
  return input.replace(ANSI_RE, '')
}

export function ocrConfigPath(): string {
  return join(homedir(), '.opencodereview', 'config.json')
}

export function sessionsRoot(): string {
  return join(homedir(), '.opencodereview', 'sessions')
}

let resolvedCli: string | null = null

/**
 * Resolve the native `ocr` entry point. On Windows npm exposes a .cmd shim;
 * pointing at it directly works even when the app was launched from Explorer
 * with a PATH that has not picked up the npm global directory.
 */
export function resolveCli(explicitPath?: string): string {
  if (explicitPath && existsSync(explicitPath)) return explicitPath
  if (resolvedCli) return resolvedCli

  const candidates: string[] = []
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) candidates.push(join(appData, 'npm', 'ocr.cmd'))
    candidates.push(join(homedir(), 'AppData', 'Roaming', 'npm', 'ocr.cmd'))
  } else {
    candidates.push('/usr/local/bin/ocr', '/opt/homebrew/bin/ocr', join(homedir(), '.local', 'bin', 'ocr'))
  }
  candidates.push('ocr')

  for (const candidate of candidates) {
    if (candidate === 'ocr' || existsSync(candidate)) {
      resolvedCli = candidate
      return candidate
    }
  }
  return 'ocr'
}

export function resetCliCache(): void {
  resolvedCli = null
}

export interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
  error?: string
}

export interface ExecOptions {
  cwd?: string
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

export function execFile(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: NodeJS.Timeout | undefined

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true
    })

    if (options.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return
        killTree(child)
        settled = true
        resolve({
          code: null,
          stdout,
          stderr,
          error: `命令执行超时（${Math.round(options.timeoutMs! / 1000)} 秒）`
        })
      }, options.timeoutMs)
    }

    child.stdout?.on('data', (d: Buffer) => {
      const text = d.toString('utf8')
      stdout += text
      options.onStdout?.(text)
    })
    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString('utf8')
      stderr += text
      options.onStderr?.(text)
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ code: null, stdout, stderr, error: err.message })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

export async function ocrExec(
  args: string[],
  options: ExecOptions & { cliPath?: string } = {}
): Promise<ExecResult> {
  const cli = resolveCli(options.cliPath)
  return execFile(cli, args, options)
}

export async function ocrVersion(cliPath?: string): Promise<{ ok: boolean; version?: string; path?: string }> {
  const cli = resolveCli(cliPath)
  const result = await execFile(cli, ['--version'], { timeoutMs: 15_000 })
  if (result.code !== 0 || result.error) {
    return { ok: false, path: cli }
  }
  const first = stripAnsi(result.stdout).trim().split(/\r?\n/)[0]?.trim()
  return { ok: true, version: first || undefined, path: cli }
}

export function parseJsonOutput<T>(stdout: string): T {
  const text = stripAnsi(stdout).trim()
  if (!text) throw new Error('命令没有返回任何内容')
  try {
    return JSON.parse(text) as T
  } catch {
    // The CLI keeps stdout machine-readable, but tolerate a leading log line.
    const objectStart = text.indexOf('{')
    const arrayStart = text.indexOf('[')
    const starts = [objectStart, arrayStart].filter((i) => i >= 0)
    if (starts.length === 0) {
      throw new Error(text.slice(0, 300))
    }
    const start = Math.min(...starts)
    return JSON.parse(text.slice(start)) as T
  }
}

function shellQuote(value: string): string {
  if (!/[\s"&|<>^]/.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}

export function buildReviewArgs(req: ReviewRequest, preview = false): string[] {
  const scan = req.mode === 'scan'
  const args: string[] = [scan ? 'scan' : 'review']

  if (!scan) {
    if (req.mode === 'branch') {
      if (req.from?.trim()) args.push('--from', req.from.trim())
      if (req.to?.trim()) args.push('--to', req.to.trim())
    }
    if (req.mode === 'commit' && req.commit?.trim()) {
      args.push('--commit', req.commit.trim())
    }
  } else if (req.paths?.trim()) {
    args.push('--path', req.paths.trim())
  }

  args.push('--format', preview ? 'text' : 'json')

  const o = req.options ?? {}
  if (o.background?.trim()) args.push('--background', o.background)
  if (o.effort?.trim()) args.push('--effort', o.effort.trim())
  if (typeof o.concurrency === 'number' && o.concurrency > 0) {
    args.push('--concurrency', String(o.concurrency))
  }
  if (typeof o.maxTokens === 'number' && o.maxTokens > 0) {
    args.push('--max-tokens', String(o.maxTokens))
  }
  if (typeof o.maxTokensBudget === 'number' && o.maxTokensBudget > 0) {
    args.push('--max-tokens-budget', String(o.maxTokensBudget))
  }
  if (req.resume?.trim()) args.push('--resume', req.resume.trim())
  if (o.model?.trim()) args.push('--model', o.model.trim())
  if (o.provider?.trim()) args.push('--provider', o.provider.trim())
  if (o.exclude?.trim()) args.push('--exclude', o.exclude.trim())
  if (o.noFilter) args.push('--no-filter')
  if (preview) args.push('--preview')

  return args
}

export function commandLine(cli: string, args: string[]): string {
  return [cli, ...args].map(shellQuote).join(' ')
}

interface ActiveRun {
  child: ChildProcess
  aborted: boolean
}

const activeRuns = new Map<string, ActiveRun>()

export function cancelRun(runId: string): void {
  const run = activeRuns.get(runId)
  if (!run) return
  run.aborted = true
  killTree(run.child)
}

export function killAllRuns(): void {
  for (const run of activeRuns.values()) {
    run.aborted = true
    killTree(run.child)
  }
  activeRuns.clear()
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      /* already gone */
    }
  }
}

function classifyLine(text: string): 'info' | 'warn' | 'error' {
  if (/\b(error|failed|failure|fatal)\b/i.test(text)) return 'error'
  if (/\b(warn|warning|retrying|timeout)\b/i.test(text)) return 'warn'
  return 'info'
}

function splitLines(prefix: string, chunk: string): { lines: string[]; rest: string } {
  const combined = prefix + chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = combined.split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts.filter((l) => l.trim().length > 0), rest }
}

export function startReview(
  req: ReviewRequest,
  emit: (event: ReviewEvent) => void,
  cliPath?: string
): { runId: string; command: string[] } {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const cli = resolveCli(cliPath)
  const args = buildReviewArgs(req)
  const startedAt = new Date()
  const child = spawn(cli, args, {
    cwd: req.repo,
    env: process.env,
    windowsHide: true,
    detached: process.platform !== 'win32'
  })

  activeRuns.set(runId, { child, aborted: false })

  let stdout = ''
  let stderr = ''
  let stderrRest = ''
  let settled = false

  const pushLine = (raw: string) => {
    const line = stripAnsi(raw).trimEnd()
    if (!line.trim()) return
    emit({ runId, type: 'log', line, level: classifyLine(line), at: Date.now() })
  }

  const finish = (state: 'done' | 'failed' | 'cancelled', message?: string) => {
    if (settled) return
    settled = true
    activeRuns.delete(runId)
    emit({ runId, type: 'state', state, message })
  }

  child.stdout?.on('data', (d: Buffer) => {
    // stdout is reserved for the final JSON document; keep it out of the log.
    stdout += d.toString('utf8')
  })
  child.stderr?.on('data', (d: Buffer) => {
    const chunk = d.toString('utf8')
    stderr += chunk
    if (stderr.length > 256_000) stderr = stderr.slice(-256_000)
    const { lines, rest } = splitLines(stderrRest, chunk)
    stderrRest = rest
    for (const line of lines) pushLine(line)
  })

  child.on('error', (err) => {
    finish('failed', err.message)
  })

  child.on('close', (code) => {
    if (stderrRest.trim()) pushLine(stderrRest)
    const run = activeRuns.get(runId)
    const aborted = run?.aborted ?? false
    activeRuns.delete(runId)

    if (aborted) {
      finish('cancelled', '已取消')
      return
    }
    if (code !== 0) {
      const detail = extractCliError(stderr) || `ocr 退出码 ${code}`
      finish('failed', detail)
      return
    }

    let result: ReviewResult
    try {
      result = parseJsonOutput<ReviewResult>(stdout)
      result.comments = Array.isArray(result.comments) ? result.comments : []
      result.warnings = Array.isArray(result.warnings) ? result.warnings : []
    } catch (err) {
      finish('failed', `无法解析审查结果：${err instanceof Error ? err.message : String(err)}`)
      return
    }

    const finishedAt = new Date()
    const meta: RunMeta = {
      id: runId,
      repo: req.repo,
      mode: req.mode,
      from: req.from,
      to: req.to,
      commit: req.commit,
      paths: req.paths,
      resume: req.resume,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      exitCode: code,
      command: [cli, ...args],
      provider: result.llm?.provider,
      model: result.llm?.model
    }
    result.run = meta
    emit({ runId, type: 'result', result })
    finish('done')
  })

  return { runId, command: [cli, ...args] }
}

export function extractCliError(stderr: string): string {
  const lines = stripAnsi(stderr)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const errorLine = [...lines].reverse().find((l) => /^error[:：]/i.test(l))
  if (errorLine) return errorLine.replace(/^error[:：]\s*/i, '')
  return lines.length ? lines[lines.length - 1] : ''
}

export async function previewReview(
  req: ReviewRequest,
  cliPath?: string
): Promise<PreviewResponse> {
  const cli = resolveCli(cliPath)
  const args = buildReviewArgs(req, true)
  const result = await execFile(cli, args, {
    cwd: req.repo,
    timeoutMs: 120_000
  })
  const text = stripAnsi(result.stdout).trim()
  if (result.error) {
    return { ok: false, text: '', command: commandLine(cli, args), error: result.error }
  }
  if (result.code !== 0) {
    return {
      ok: false,
      text,
      command: commandLine(cli, args),
      error: extractCliError(result.stderr) || `ocr 退出码 ${result.code}`
    }
  }
  return {
    ok: true,
    text: text || stripAnsi(result.stderr).trim() || '没有匹配到需要审查的文件。',
    command: commandLine(cli, args)
  }
}
