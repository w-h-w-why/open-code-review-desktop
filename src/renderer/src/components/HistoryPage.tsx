import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Columns3,
  Download,
  FileCode2,
  FolderGit2,
  History,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert
} from 'lucide-react'
import type {
  CompareResult,
  ReviewComment,
  SessionDetail,
  SessionItem,
  SessionSummary
} from '@shared/types'
import FindingsLedger from './FindingsLedger'
import { Button, Chip, EmptyState, IconButton, Modal, Spinner } from './ui'
import {
  basename,
  categoryLabel,
  formatDateTime,
  formatDuration,
  modeLabel,
  relativeTime,
  sessionMode,
  sessionRange,
  sessionStatus,
  severityLabel
} from '../utils/format'

type Toast = (text: string, tone?: 'info' | 'success' | 'error') => void

function scrollPageTop(): void {
  document.querySelector('.workspace__body')?.scrollTo({ top: 0 })
}

function CompareFinding({ comment }: { comment: ReviewComment }): React.JSX.Element {
  return (
    <div className={`compare-finding sev-${comment.severity ?? 'none'}`}>
      <span className="compare-finding__sev">{severityLabel(comment.severity)}</span>
      <span className="compare-finding__path" title={comment.path}>
        {basename(comment.path)}
        <small>L{comment.start_line}</small>
      </span>
      <span className="compare-finding__text">{comment.content}</span>
    </div>
  )
}

function CompareView({
  result,
  onBack
}: {
  result: CompareResult
  onBack: () => void
}): React.JSX.Element {
  const buckets = [
    { key: 'new', title: '新增', tone: 'red', items: result.new, note: '只在后一次审查中出现' },
    {
      key: 'persisting',
      title: '仍存在',
      tone: 'blue',
      items: result.persisting,
      note: '两次审查都发现了'
    },
    { key: 'resolved', title: '已解决', tone: 'green', items: result.resolved, note: '后一次审查未再发现' },
    {
      key: 'not_reviewed',
      title: '未复查',
      tone: 'muted',
      items: result.not_reviewed,
      note: '后一次审查没有覆盖这些文件'
    }
  ] as const

  return (
    <div className="history-detail">
      <header className="page-head">
        <div className="page-head__copy">
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={14} />
            返回会话列表
          </button>
          <h2>两次审查之间</h2>
          <p className="compare-range">
            <code>{result.before.session_id}</code>
            <span>→</span>
            <code>{result.after.session_id}</code>
          </p>
        </div>
      </header>

      <div className="compare-summary">
        {buckets.map((bucket) => (
          <div key={bucket.key} className={`compare-summary__item is-${bucket.tone}`}>
            <span>{bucket.title}</span>
            <strong>{bucket.items.length}</strong>
            <small>{bucket.note}</small>
          </div>
        ))}
      </div>

      <div className="compare-sections">
        {buckets.map((bucket) => (
          <section className="compare-section" key={bucket.key}>
            <header>
              <span className={`compare-section__dot is-${bucket.tone}`} />
              <h3>{bucket.title}</h3>
              <span>{bucket.items.length}</span>
            </header>
            {bucket.items.length === 0 ? (
              <p className="compare-section__empty">没有这一类的发现。</p>
            ) : (
              <div className="compare-section__list">
                {bucket.items.map((comment, index) => (
                  <CompareFinding key={`${bucket.key}-${index}`} comment={comment} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

function ItemList({ items }: { items: SessionItem[] }): React.JSX.Element {
  return (
    <details className="items-panel">
      <summary>
        <FileCode2 size={14} />
        文件明细（{items.length}）
      </summary>
      <div className="items-panel__list">
        {items.map((item, index) => (
          <div className="items-row" key={`${item.file_path}-${index}`}>
            <span className={`items-row__type is-${item.type}`}>
              {item.type === 'review_item_done'
                ? '完成'
                : item.type === 'review_item_reused'
                  ? '复用'
                  : '失败'}
            </span>
            <span className="items-row__path" title={item.file_path}>
              {item.file_path || item.new_path || item.old_path}
            </span>
            <span>{item.comments} 条</span>
            {item.error ? <span className="items-row__error">{item.error}</span> : null}
          </div>
        ))}
      </div>
    </details>
  )
}

export default function HistoryPage({
  repo,
  resetKey,
  onToast,
  onReuse,
  onOpenProject
}: {
  repo: string
  resetKey: number
  onToast: Toast
  onReuse: (session: SessionSummary, action: 'reuse' | 'resume') => void
  onOpenProject: () => void
}): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<{ summary: SessionSummary; comments: ReviewComment[]; items: SessionItem[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [compare, setCompare] = useState<CompareResult | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!repo) {
      setSessions([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await window.ocr.sessions.list(repo)
      setSessions(Array.isArray(list) ? list : [])
    } catch (err) {
      setSessions([])
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [repo])

  useEffect(() => {
    setDetail(null)
    setCompare(null)
    setSelected([])
    void load()
  }, [load, repo, resetKey])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return sessions
    return sessions.filter(
      (session) =>
        session.session_id.toLowerCase().includes(needle) ||
        (session.model ?? '').toLowerCase().includes(needle) ||
        (session.git_branch ?? '').toLowerCase().includes(needle) ||
        sessionRange(session).toLowerCase().includes(needle)
    )
  }, [sessions, query])

  async function openSession(session: SessionSummary): Promise<void> {
    scrollPageTop()
    setDetailLoading(true)
    setCompare(null)
    try {
      const [full, comments] = await Promise.all([
        window.ocr.sessions.show(repo, session.session_id),
        window.ocr.sessions.comments(repo, session.session_id)
      ])
      setDetail({
        summary: full.summary,
        comments: Array.isArray(comments) ? comments : [],
        items: Array.isArray(full.items) ? full.items : []
      })
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  function toggleSelect(id: string): void {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (current.length >= 2) return current
      return [...current, id]
    })
  }

  async function runCompare(): Promise<void> {
    if (selected.length !== 2) return
    scrollPageTop()
    const ordered = [...selected].sort((a, b) => {
      const sa = sessions.find((s) => s.session_id === a)
      const sb = sessions.find((s) => s.session_id === b)
      return new Date(sa?.start_time ?? 0).getTime() - new Date(sb?.start_time ?? 0).getTime()
    })
    setCompareLoading(true)
    setDetail(null)
    try {
      const result = await window.ocr.sessions.compare(repo, ordered[0], ordered[1])
      setCompare(result)
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setCompareLoading(false)
    }
  }

  async function removeSession(): Promise<void> {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await window.ocr.sessions.remove(deleteTarget.session_id)
      onToast('会话已删除', 'success')
      if (detail?.summary.session_id === deleteTarget.session_id) setDetail(null)
      if (compare?.after.session_id === deleteTarget.session_id || compare?.before.session_id === deleteTarget.session_id) {
        setCompare(null)
      }
      setSelected((current) => current.filter((id) => id !== deleteTarget.session_id))
      setDeleteTarget(null)
      await load()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function exportHtml(sessionId: string): Promise<void> {
    try {
      const saved = await window.ocr.sessions.exportHtml(repo, sessionId)
      if (saved.saved) onToast(`已导出 ${saved.path}`, 'success')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  if (!repo) {
    return (
      <EmptyState
        icon={<FolderGit2 size={26} />}
        title="先打开一个仓库"
        text="历史会话按仓库归档。打开仓库后，这里会列出它的每一次审查。"
        action={
          <Button variant="primary" onClick={onOpenProject}>
            打开本地仓库
          </Button>
        }
      />
    )
  }

  if (detail) {
    const status = sessionStatus(detail.summary)
    const session = detail.summary
    return (
      <div className="history-detail">
        <header className="page-head">
          <div className="page-head__copy">
            <button
              className="back-link"
              onClick={() => {
                setDetail(null)
                scrollPageTop()
              }}
            >
              <ArrowLeft size={14} />
              返回会话列表
            </button>
            <div className="page-head__meta">
              <Chip tone={status.tone === 'ok' ? 'green' : status.tone === 'warn' ? 'amber' : 'red'}>
                {status.label}
              </Chip>
              <span>{modeLabel(session.review_mode)}</span>
              <span className="page-head__dot">·</span>
              <code>{session.session_id}</code>
            </div>
            <h2>{sessionRange(session)}</h2>
            <p>
              {formatDateTime(session.start_time)} · {session.completed_files}/{session.selected_files} 个文件 ·{' '}
              {session.total_comments} 条发现
              {session.duration_ns ? ` · 用时 ${formatDuration(session.duration_ns / 1_000_000)}` : ''}
            </p>
          </div>
          <div className="page-head__actions">
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={14} />}
              onClick={() => void exportHtml(session.session_id)}
            >
              导出 HTML
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={() => onReuse(session, 'reuse')}
            >
              复用范围
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Play size={13} />}
              onClick={() => onReuse(session, 'resume')}
            >
              继续审查
            </Button>
          </div>
        </header>

        {session.aborted || session.failed_files > 0 ? (
          <div className="notice-bar notice-bar--static">
            <TriangleAlert size={16} />
            <span>
              {session.aborted ? '这次审查被中止了。' : `${session.failed_files} 个文件没有完成审查。`}
              可以继续审查，已完成的文件结果会被复用。
            </span>
          </div>
        ) : null}

        <FindingsLedger
          comments={detail.comments}
          repo={repo}
          identity={session.session_id}
          onToast={onToast}
        />

        {detail.items.length > 0 ? <ItemList items={detail.items} /> : null}

        <div className="detail-foot">
          <span>
            模型 {session.model || '—'} · 分支 {session.git_branch || '—'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={13} />}
            onClick={() => setDeleteTarget(session)}
          >
            删除会话
          </Button>
        </div>

        <Modal
          open={Boolean(deleteTarget)}
          title="删除这次会话？"
          subtitle="会话文件会从本机删除，操作不可撤销。"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button variant="danger" loading={deleting} onClick={() => void removeSession()}>
                删除
              </Button>
            </>
          }
        >
          <p className="modal__text">
            <code>{deleteTarget?.session_id}</code>
          </p>
        </Modal>
      </div>
    )
  }

  if (compare) {
    return (
      <CompareView
        result={compare}
        onBack={() => {
          setCompare(null)
          scrollPageTop()
        }}
      />
    )
  }

  return (
    <div className="history-page">
      <header className="page-head">
        <div className="page-head__copy">
          <div className="page-head__meta">
            <span>{sessions.length} 次记录</span>
            <span className="page-head__dot">·</span>
            <span className="mono">~/.opencodereview/sessions</span>
          </div>
          <h2>审查会话</h2>
          <p>勾选两次审查，查看新增、仍存在与已解决的问题。</p>
        </div>
        <div className="page-head__actions">
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} className={loading ? 'spin' : ''} />}
            onClick={() => void load()}
          >
            刷新
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={compareLoading ? undefined : <Columns3 size={14} />}
            loading={compareLoading}
            disabled={selected.length !== 2}
            onClick={() => void runCompare()}
          >
            对比所选{selected.length ? `（${selected.length}）` : ''}
          </Button>
        </div>
      </header>

      <div className="history-toolbar">
        <label className="search-box">
          <Search size={14} />
          <input
            value={query}
            placeholder="搜索会话、模型或分支"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {selected.length > 0 ? (
          <span className="history-toolbar__hint">已选 {selected.length} / 2 次审查</span>
        ) : null}
      </div>

      {loading && sessions.length === 0 ? (
        <div className="history-loading">
          <Spinner label="正在读取会话…" />
        </div>
      ) : error ? (
        <EmptyState
          icon={<TriangleAlert size={24} />}
          title="没有读取到会话"
          text={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              重试
            </Button>
          }
        />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<History size={26} />}
          title="这个仓库还没有审查记录"
          text="完成一次审查后，会话会自动出现在这里。"
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search size={24} />} title="没有匹配的会话" text="换一个关键词试试。" />
      ) : (
        <div className="session-table" role="table" aria-label="审查会话">
          <div className="session-row session-row--head" role="row">
            <span />
            <span>时间</span>
            <span>范围</span>
            <span>模型</span>
            <span>文件</span>
            <span>发现</span>
            <span>状态</span>
            <span />
          </div>
          {filtered.map((session) => {
            const status = sessionStatus(session)
            const checked = selected.includes(session.session_id)
            return (
              <div
                key={session.session_id}
                className={`session-row ${checked ? 'is-selected' : ''}`}
                role="row"
                onClick={() => void openSession(session)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void openSession(session)
                }}
              >
                <span className="session-row__check" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelect(session.session_id)}
                    aria-label={`选择会话 ${session.session_id}`}
                  />
                </span>
                <span className="session-row__time">
                  <strong>{relativeTime(session.start_time)}</strong>
                  <small>{formatDateTime(session.start_time)}</small>
                </span>
                <span className="session-row__range">
                  <span className="session-row__range-main">{sessionRange(session)}</span>
                  <small>
                    {modeLabel(session.review_mode)}
                    {session.git_branch ? ` · ${session.git_branch}` : ''}
                  </small>
                </span>
                <span className="session-row__model" title={session.model}>
                  {session.model || '—'}
                </span>
                <span className="session-row__num">
                  {session.completed_files}/{session.selected_files}
                </span>
                <span className="session-row__num">
                  {session.total_comments > 0 ? (
                    <span className="count-badge">{session.total_comments}</span>
                  ) : (
                    <CheckCircle2 size={14} className="count-clean" />
                  )}
                </span>
                <span>
                  <Chip tone={status.tone === 'ok' ? 'green' : status.tone === 'warn' ? 'amber' : 'red'}>
                    {status.label}
                  </Chip>
                </span>
                <span className="session-row__actions" onClick={(event) => event.stopPropagation()}>
                  <IconButton label="打开会话" onClick={() => void openSession(session)}>
                    <ArrowRight size={14} />
                  </IconButton>
                  <IconButton label="删除会话" onClick={() => setDeleteTarget(session)}>
                    <Trash2 size={13} />
                  </IconButton>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {detailLoading ? (
        <div className="overlay-loading">
          <Spinner label="正在加载会话…" />
        </div>
      ) : null}

      <Modal
        open={Boolean(deleteTarget)}
        title="删除这次会话？"
        subtitle="会话文件会从本机删除，操作不可撤销。"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void removeSession()}>
              删除
            </Button>
          </>
        }
      >
        <p className="modal__text">
          <code>{deleteTarget?.session_id}</code>
        </p>
      </Modal>
    </div>
  )
}
