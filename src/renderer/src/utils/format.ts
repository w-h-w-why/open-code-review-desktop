import type { ReviewComment, ReviewResult, SessionSummary } from '@shared/types'

export function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export function dirname(path: string): string {
  const parts = path.split(/[\\/]/)
  parts.pop()
  return parts.join('/')
}

export function shortPath(path: string, max = 62): string {
  if (path.length <= max) return path
  return `…${path.slice(-(max - 1))}`
}

export function relativeTime(input: string | number | Date | undefined): string {
  if (!input) return '—'
  const time = new Date(input).getTime()
  if (!Number.isFinite(time)) return '—'
  const diff = Date.now() - time
  const abs = Math.abs(diff)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (abs < minute) return '刚刚'
  if (abs < hour) return `${Math.floor(abs / minute)} 分钟前`
  if (abs < day) return `${Math.floor(abs / hour)} 小时前`
  if (abs < 7 * day) return `${Math.floor(abs / day)} 天前`
  return new Date(time).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

export function formatDateTime(input: string | number | Date | undefined): string {
  if (!input) return '—'
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}

export function formatTokens(value: number | undefined): string {
  if (!value) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

export const MODE_LABELS: Record<string, string> = {
  workspace: '工作区更改',
  branch: '分支对比',
  commit: '单次提交',
  scan: '全量扫描',
  full_scan: '全量扫描',
  review: '差异审查'
}

export function modeLabel(mode: string | undefined): string {
  if (!mode) return '—'
  return MODE_LABELS[mode] ?? mode
}

export const SEVERITY_LABELS: Record<string, string> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危'
}

export const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
}

export function severityLabel(value: string | undefined): string {
  if (!value) return '未分级'
  return SEVERITY_LABELS[value] ?? value
}

export const CATEGORY_LABELS: Record<string, string> = {
  bug: '缺陷',
  security: '安全',
  performance: '性能',
  maintainability: '可维护性',
  test: '测试',
  style: '风格',
  documentation: '文档',
  other: '其他'
}

export function categoryLabel(value: string | undefined): string {
  if (!value) return '未分类'
  return CATEGORY_LABELS[value] ?? value
}

export function findingKey(comment: ReviewComment): string {
  const raw = `${comment.path}\u0000${comment.start_line}\u0000${comment.category ?? ''}\u0000${comment.content}`
  let hash = 2166136261
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function sortComments(comments: ReviewComment[]): ReviewComment[] {
  return [...comments].sort((a, b) => {
    const pa = a.path.localeCompare(b.path)
    if (pa !== 0) return pa
    const sa = SEVERITY_RANK[a.severity ?? ''] ?? 9
    const sb = SEVERITY_RANK[b.severity ?? ''] ?? 9
    if (sa !== sb) return sa - sb
    return (a.start_line ?? 0) - (b.start_line ?? 0)
  })
}

export function groupByFile(comments: ReviewComment[]): { path: string; comments: ReviewComment[] }[] {
  const map = new Map<string, ReviewComment[]>()
  for (const comment of comments) {
    const list = map.get(comment.path) ?? []
    list.push(comment)
    map.set(comment.path, list)
  }
  return Array.from(map.entries())
    .map(([path, items]) => ({ path, comments: sortComments(items) }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export function sessionRange(session: SessionSummary): string {
  if (session.review_mode === 'full_scan' || session.review_mode === 'scan') return '全量扫描'
  if (session.diff_commit) return session.diff_commit.slice(0, 10)
  if (session.diff_from || session.diff_to) {
    return `${session.diff_from || '…'} → ${session.diff_to || '工作区'}`
  }
  return '工作区更改'
}

export function sessionMode(session: SessionSummary): string {
  if (session.review_mode === 'full_scan') return 'scan'
  if (session.review_mode) return session.review_mode
  if (session.diff_commit) return 'commit'
  if (session.diff_from || session.diff_to) return 'branch'
  return 'workspace'
}

export function sessionStatus(session: SessionSummary): {
  label: string
  tone: 'ok' | 'warn' | 'bad' | 'idle'
} {
  if (session.aborted) return { label: '已中止', tone: 'bad' }
  if (session.failed_files > 0) return { label: '部分完成', tone: 'warn' }
  const state = session.run_manifest?.terminal_state
  if (state === 'partial') return { label: '部分完成', tone: 'warn' }
  if (state === 'failed') return { label: '失败', tone: 'bad' }
  if (state === 'completed') return { label: '已完成', tone: 'ok' }
  if (session.end_time) return { label: '已完成', tone: 'ok' }
  return { label: '未结束', tone: 'warn' }
}

export function commentCounts(comments: ReviewComment[]): Record<string, number> {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, none: 0 }
  for (const comment of comments) {
    const key = comment.severity && counts[comment.severity] !== undefined ? comment.severity : 'none'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export function buildMarkdown(
  result: ReviewResult,
  repo: string,
  sessionId?: string
): string {
  const lines: string[] = []
  const title = result.run ? MODE_LABELS[result.run.mode] ?? '审查' : '代码审查'
  lines.push(`# OpenCodeReview · ${title}`)
  lines.push('')
  lines.push(`- 仓库：\`${repo}\``)
  if (result.run?.from || result.run?.to) {
    lines.push(`- 范围：\`${result.run.from || '…'} → ${result.run.to || '工作区'}\``)
  }
  if (result.run?.commit) lines.push(`- 提交：\`${result.run.commit}\``)
  if (result.llm?.model) lines.push(`- 模型：\`${result.llm.model}\``)
  if (sessionId) lines.push(`- 会话：\`${sessionId}\``)
  if (result.summary) {
    lines.push(
      `- 文件：${result.summary.files_reviewed} · 发现：${result.summary.comments} · Token：${result.summary.total_tokens} · 用时：${result.summary.elapsed}`
    )
  }
  lines.push('')

  if (result.project_summary) {
    lines.push('## 项目摘要')
    lines.push('')
    lines.push(result.project_summary)
    lines.push('')
  }

  const groups = groupByFile(result.comments)
  if (groups.length === 0) {
    lines.push('未发现问题。')
  }
  for (const group of groups) {
    lines.push(`## \`${group.path}\``)
    lines.push('')
    for (const comment of group.comments) {
      const severity = severityLabel(comment.severity)
      const category = categoryLabel(comment.category)
      lines.push(`### ${severity} · ${category} · L${comment.start_line}-${comment.end_line}`)
      lines.push('')
      lines.push(comment.content)
      lines.push('')
      if (comment.existing_code) {
        lines.push('现有代码：')
        lines.push('```')
        lines.push(comment.existing_code)
        lines.push('```')
        lines.push('')
      }
      if (comment.suggestion_code) {
        lines.push('建议代码：')
        lines.push('```')
        lines.push(comment.suggestion_code)
        lines.push('```')
        lines.push('')
      }
    }
  }
  return lines.join('\n')
}
