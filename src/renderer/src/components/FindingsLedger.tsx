import { useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CornerDownRight,
  ExternalLink,
  FileCode2,
  Search,
  ShieldCheck,
  X
} from 'lucide-react'
import type { ReviewComment } from '@shared/types'
import { useTriage } from '../hooks/useTriage'
import { IconButton } from './ui'
import {
  basename,
  categoryLabel,
  commentCounts,
  dirname,
  findingKey,
  groupByFile,
  SEVERITY_LABELS,
  SEVERITY_RANK,
  severityLabel
} from '../utils/format'

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'none'

function severityClass(value: string | undefined): string {
  return `sev-${value && SEVERITY_LABELS[value] ? value : 'none'}`
}

function CodeBlock({
  code,
  startLine,
  tone,
  label
}: {
  code: string
  startLine: number
  tone: 'old' | 'new'
  label: string
}): React.JSX.Element {
  const lines = code.replace(/\n$/, '').split('\n')
  return (
    <div className={`code-block code-block--${tone}`}>
      <div className="code-block__head">{label}</div>
      <pre>
        {lines.map((line, index) => (
          <div className="code-line" key={index}>
            <span className="code-line__no">{startLine + index}</span>
            <span className="code-line__text">{line || ' '}</span>
          </div>
        ))}
      </pre>
    </div>
  )
}

function FindingRow({
  comment,
  repo,
  triageMap,
  onMark,
  onToast
}: {
  comment: ReviewComment
  repo: string
  triageMap: ReturnType<typeof useTriage>['map']
  onMark: (key: string, state: 'fixed' | 'ignored' | null) => void
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const key = findingKey(comment)
  const handled = triageMap[key]
  const severity = comment.severity && SEVERITY_LABELS[comment.severity] ? comment.severity : 'none'

  async function copy(): Promise<void> {
    const text = `[${severityLabel(comment.severity)}] ${comment.path}:${comment.start_line}-${comment.end_line}\n\n${comment.content}`
    await window.ocr.shell.copyText(text)
    onToast('已复制这条发现', 'success')
  }

  async function openFile(): Promise<void> {
    const ok = await window.ocr.shell.openInEditor(repo, comment.path, comment.start_line)
    if (!ok) onToast('无法打开编辑器，已尝试使用系统默认程序', 'info')
  }

  return (
    <article className={`finding ${severityClass(comment.severity)} ${handled ? 'is-handled' : ''}`}>
      <button className="finding__row" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="finding__severity">{severityLabel(comment.severity)}</span>
        <span className="finding__category">{categoryLabel(comment.category)}</span>
        <span className="finding__lines">
          L{comment.start_line}–{comment.end_line}
        </span>
        <span className={`finding__summary ${open ? 'is-open' : ''}`}>{comment.content}</span>
        {handled ? (
          <span className="finding__state">
            {handled.state === 'fixed' ? '已修复' : '已忽略'}
          </span>
        ) : null}
        <span className="finding__chevron" aria-hidden="true">
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open ? (
        <div className="finding__detail">
          <p className="finding__content">{comment.content}</p>

          {comment.thinking ? (
            <details className="thinking">
              <summary>模型分析过程</summary>
              <p>{comment.thinking}</p>
            </details>
          ) : null}

          {comment.existing_code || comment.suggestion_code ? (
            <div className={`code-pair ${comment.existing_code && comment.suggestion_code ? '' : 'is-single'}`}>
              {comment.existing_code ? (
                <CodeBlock
                  code={comment.existing_code}
                  startLine={comment.start_line}
                  tone="old"
                  label="现有代码"
                />
              ) : null}
              {comment.suggestion_code ? (
                <CodeBlock
                  code={comment.suggestion_code}
                  startLine={comment.start_line}
                  tone="new"
                  label="建议代码"
                />
              ) : null}
            </div>
          ) : null}

          <div className="finding__actions">
            <span className="finding__identity" title={key}>
              <CornerDownRight size={13} />
              {comment.path}
            </span>
            <div className="finding__buttons">
              <button className="action-btn" onClick={() => void openFile()}>
                <ExternalLink size={13} />
                在编辑器中打开
              </button>
              <button className="action-btn" onClick={() => void copy()}>
                <Copy size={13} />
                复制
              </button>
              <button
                className={`action-btn ${handled?.state === 'fixed' ? 'is-on' : ''}`}
                onClick={() => onMark(key, handled?.state === 'fixed' ? null : 'fixed')}
              >
                <Check size={13} />
                {handled?.state === 'fixed' ? '取消已修复' : '标记已修复'}
              </button>
              <button
                className={`action-btn ${handled?.state === 'ignored' ? 'is-on' : ''}`}
                onClick={() => onMark(key, handled?.state === 'ignored' ? null : 'ignored')}
              >
                <X size={13} />
                {handled?.state === 'ignored' ? '取消忽略' : '忽略'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}

export default function FindingsLedger({
  comments,
  repo,
  identity,
  onToast
}: {
  comments: ReviewComment[]
  repo: string
  identity: string
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
}): React.JSX.Element {
  const { map, mark, clear, counts: triageCounts } = useTriage(repo, identity)
  const [severity, setSeverity] = useState<SeverityFilter>('all')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [hideHandled, setHideHandled] = useState(false)
  const items = useMemo(() => (Array.isArray(comments) ? comments : []), [comments])

  const counts = useMemo(() => commentCounts(items), [items])
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const comment of items) {
      if (comment.category) set.add(comment.category)
    }
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((comment) => {
      const sev = comment.severity && SEVERITY_LABELS[comment.severity] ? comment.severity : 'none'
      if (severity !== 'all' && sev !== severity) return false
      if (category !== 'all' && (comment.category ?? '') !== category) return false
      if (hideHandled && map[findingKey(comment)]) return false
      if (!needle) return true
      return (
        comment.path.toLowerCase().includes(needle) ||
        comment.content.toLowerCase().includes(needle) ||
        (comment.category ?? '').toLowerCase().includes(needle)
      )
    })
  }, [items, severity, category, query, hideHandled, map])

  const groups = useMemo(() => groupByFile(filtered), [filtered])
  const filterButtons: { value: SeverityFilter; label: string; count: number }[] = [
    { value: 'all', label: '全部', count: items.length },
    { value: 'critical', label: '严重', count: counts.critical },
    { value: 'high', label: '高危', count: counts.high },
    { value: 'medium', label: '中危', count: counts.medium },
    { value: 'low', label: '低危', count: counts.low },
    { value: 'none', label: '未分级', count: counts.none }
  ]

  return (
    <div className="ledger">
      <div className="ledger__toolbar">
        <div className="ledger__filters">
          {filterButtons.map((button) => (
            <button
              key={button.value}
              className={`filter-pill ${severity === button.value ? 'is-active' : ''} ${button.value !== 'all' ? `filter-pill--${button.value}` : ''}`}
              onClick={() => setSeverity(button.value)}
              disabled={button.value !== 'all' && button.count === 0}
            >
              {button.label}
              <span>{button.count}</span>
            </button>
          ))}
        </div>

        <div className="ledger__tools">
          {categories.length > 0 ? (
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="按类别筛选">
              <option value="all">全部类别</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {categoryLabel(value)}
                </option>
              ))}
            </select>
          ) : null}

          <label className="search-box">
            <Search size={14} />
            <input
              value={query}
              placeholder="搜索文件或内容"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="toggle-inline">
            <input
              type="checkbox"
              checked={hideHandled}
              onChange={(event) => setHideHandled(event.target.checked)}
            />
            隐藏已处理
          </label>

          {triageCounts.fixed + triageCounts.ignored > 0 ? (
            <button className="link-btn link-btn--small" onClick={clear} title="清除本会话的所有本地标记">
              清除标记（{triageCounts.fixed + triageCounts.ignored}）
            </button>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="ledger__empty">
          <ShieldCheck size={22} />
          <p>{items.length === 0 ? '本次审查没有发现需要处理的问题。' : '没有符合筛选条件的发现。'}</p>
        </div>
      ) : (
        <div className="ledger__groups">
          {groups.map((group) => {
            const fileSeverities = new Set(group.comments.map((c) => c.severity ?? 'none'))
            const maxSeverity = [...fileSeverities].sort(
              (a, b) => (SEVERITY_RANK[a] ?? 9) - (SEVERITY_RANK[b] ?? 9)
            )[0]
            return (
              <section className="file-group" key={group.path}>
                <header className="file-group__head">
                  <FileCode2 size={15} />
                  <span className="file-group__path" title={group.path}>
                    <span className="file-group__dir">{dirname(group.path) ? `${dirname(group.path)}/` : ''}</span>
                    <strong>{basename(group.path)}</strong>
                  </span>
                  <span className="file-group__count">{group.comments.length} 条</span>
                  <span className={`file-group__mark sev-${maxSeverity}`} />
                  <IconButton
                    label="在文件管理器中显示"
                    onClick={() =>
                      window.ocr.shell.revealPath(
                        `${repo.replace(/[\\/]$/, '')}/${group.path}`
                      )
                    }
                  >
                    <ExternalLink size={13} />
                  </IconButton>
                </header>

                <div className="file-group__rows">
                  {group.comments.map((comment, index) => (
                    <FindingRow
                      key={`${findingKey(comment)}-${index}`}
                      comment={comment}
                      repo={repo}
                      triageMap={map}
                      onMark={mark}
                      onToast={onToast}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <footer className="ledger__foot">
        显示 {filtered.length} / {items.length} 条发现
        {triageCounts.fixed + triageCounts.ignored > 0 ? (
          <span>
            · 本地已处理 {triageCounts.fixed + triageCounts.ignored} 条
          </span>
        ) : null}
      </footer>
    </div>
  )
}
