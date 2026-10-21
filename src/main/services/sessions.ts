import type {
  CompareResult,
  ReviewComment,
  SessionDetail,
  SessionSummary
} from '@shared/types'
import { ocrExec, parseJsonOutput, resolveCli } from './cli'

export async function listSessions(repo: string, cliPath?: string): Promise<SessionSummary[]> {
  const result = await ocrExec(
    ['session', 'list', '--repo', repo, '--json', '--limit', '0'],
    { cliPath, timeoutMs: 60_000 }
  )
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.error || '读取会话列表失败')
  }
  const text = result.stdout.trim()
  if (!text) return []
  const parsed = parseJsonOutput<SessionSummary[] | null>(text)
  return Array.isArray(parsed) ? parsed : []
}

export async function showSession(
  repo: string,
  sessionId: string,
  cliPath?: string
): Promise<SessionDetail> {
  const result = await ocrExec(
    ['session', 'show', '--repo', repo, '--json', sessionId],
    { cliPath, timeoutMs: 60_000 }
  )
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.error || '读取会话失败')
  }
  const parsed = parseJsonOutput<SessionDetail>(result.stdout)
  return { summary: parsed.summary, items: Array.isArray(parsed.items) ? parsed.items : [] }
}

export async function sessionComments(
  repo: string,
  sessionId: string,
  cliPath?: string
): Promise<ReviewComment[]> {
  const result = await ocrExec(
    ['session', 'comments', '--repo', repo, '--json', sessionId],
    { cliPath, timeoutMs: 60_000 }
  )
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.error || '读取审查结果失败')
  }
  const parsed = parseJsonOutput<ReviewComment[] | null>(result.stdout)
  return Array.isArray(parsed) ? parsed : []
}

export async function compareSessions(
  repo: string,
  before: string,
  after: string,
  cliPath?: string
): Promise<CompareResult> {
  const result = await ocrExec(
    ['session', 'compare', '--repo', repo, '--json', before, after],
    { cliPath, timeoutMs: 60_000 }
  )
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.error || '对比会话失败')
  }
  const parsed = parseJsonOutput<CompareResult>(result.stdout)
  return {
    ...parsed,
    new: Array.isArray(parsed.new) ? parsed.new : [],
    persisting: Array.isArray(parsed.persisting) ? parsed.persisting : [],
    resolved: Array.isArray(parsed.resolved) ? parsed.resolved : [],
    not_reviewed: Array.isArray(parsed.not_reviewed) ? parsed.not_reviewed : []
  }
}

export async function removeSession(sessionId: string, cliPath?: string): Promise<void> {
  const result = await ocrExec(['session', 'rm', '--yes', sessionId], {
    cliPath,
    timeoutMs: 30_000
  })
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.error || '删除会话失败')
  }
}

export async function exportSessionHtml(
  repo: string,
  sessionId: string,
  outputPath: string,
  cliPath?: string
): Promise<void> {
  const result = await ocrExec(
    ['session', 'export', '--repo', repo, sessionId, '-o', outputPath],
    { cliPath, timeoutMs: 60_000 }
  )
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.error || '导出 HTML 失败')
  }
}

export function cliDisplayPath(): string {
  return resolveCli()
}
