import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileDown,
  History,
  Loader2,
  Play,
  Square,
  Terminal,
  TriangleAlert
} from 'lucide-react'
import type { GitStatus, ReviewResult, SessionSummary } from '@shared/types'
import type { FormState, PreviewState, RunState } from '../types'
import FindingsLedger from './FindingsLedger'
import { Button, Chip, Modal, Spinner, useToast } from './ui'
import {
  buildMarkdown,
  formatDuration,
  formatTokens,
  modeLabel,
  relativeTime,
  sessionRange
} from '../utils/format'

const headlines: Record<string, { title: string; note: string }> = {
  workspace: { title: '审查工作区更改', note: '暂存、未暂存与未跟踪的文件会一起进入审查。' },
  branch: { title: '审查分支差异', note: '从分叉点开始比较两个引用之间的全部改动。' },
  commit: { title: '审查单次提交', note: '以该提交与父提交的差异为审查对象。' },
  scan: { title: '全量扫描代码库', note: '不依赖 diff，逐个文件阅读并给出发现。' }
}

function statusView(run: RunState): { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'muted' } {
  switch (run.state) {
    case 'running':
      return { label: '审查中', tone: 'blue' }
    case 'done':
      return { label: '已完成', tone: 'green' }
    case 'failed':
      return { label: '失败', tone: 'red' }
    case 'cancelled':
      return { label: '已取消', tone: 'amber' }
    default:
      return { label: '待开始', tone: 'muted' }
  }
}

function Elapsed({ startedAt, running }: { startedAt: number; running: boolean }): React.JSX.Element {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  return <>{formatDuration(Math.max(0, now - startedAt))}</>
}

function SummaryStrip({ result }: { result: ReviewResult }): React.JSX.Element {
  const summary = result.summary
  return (
    <section className="summary">
      <div className="summary__row">
        <div className="summary__item">
          <span>审查文件</span>
          <strong>{summary?.files_reviewed ?? '—'}</strong>
        </div>
        <div className="summary__item">
          <span>发现</span>
          <strong>{result.comments.length}</strong>
        </div>
        <div className="summary__item">
          <span>Token</span>
          <strong>{formatTokens(summary?.total_tokens)}</strong>
          {summary ? (
            <small>
              入 {formatTokens(summary.input_tokens)} / 出 {formatTokens(summary.output_tokens)}
            </small>
          ) : null}
        </div>
        <div className="summary__item">
          <span>用时</span>
          <strong>{summary?.elapsed ?? '—'}</strong>
        </div>
        <div className="summary__item summary__item--model">
          <span>模型</span>
          <strong title={result.llm?.model}>{result.llm?.model ?? '—'}</strong>
          {result.llm?.provider ? <small>{result.llm.provider}</small> : null}
        </div>
      </div>

      {result.message ? <p className="summary__message">{result.message}</p> : null}

      {result.warnings && result.warnings.length > 0 ? (
        <details className="summary__notice">
          <summary>
            <TriangleAlert size={14} />
            {result.warnings.length} 条运行时警告
          </summary>
          <ul>
            {result.warnings.map((warning, index) => (
              <li key={index}>
                <code>{warning.type}</code>
                {warning.file ? <span>{warning.file}</span> : null}
                <p>{warning.message}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {result.project_summary ? (
        <details className="summary__notice summary__notice--plain">
          <summary>项目摘要</summary>
          <p className="summary__project-text">{result.project_summary}</p>
        </details>
      ) : null}
    </section>
  )
}

function RunPanel({
  run,
  onCancel,
  onStart
}: {
  run: RunState
  onCancel: () => void
  onStart: () => void
}): React.JSX.Element {
  const logRef = useRef<HTMLDivElement | null>(null)
  const lastActivity =
    [...run.logs].reverse().find((log) => log.level !== 'error' && log.line.trim())?.line ??
    '正在准备审查上下文…'

  useEffect(() => {
    if (!logRef.current) return
    logRef.current.scrollTop = logRef.current.scrollHeight
  }, [run.logs])

  const running = run.state === 'running'

  return (
    <section className="run-panel">
      <div className="run-panel__top">
        <div className="run-panel__status">
          {running ? <span className="pulse" /> : null}
          <div>
            <strong>{running ? '正在审查' : run.state === 'cancelled' ? '审查已取消' : '审查未完成'}</strong>
            <p>{running ? lastActivity : run.error ?? '可以调整范围后重试。'}</p>
          </div>
        </div>
        <div className="run-panel__meta">
          {run.startedAt ? (
            <span>
              <Clock3 size={13} />
              <Elapsed startedAt={run.startedAt} running={running} />
            </span>
          ) : null}
          {running ? (
            <Button variant="danger" size="sm" icon={<Square size={12} fill="currentColor" />} onClick={onCancel}>
              取消
            </Button>
          ) : (
            <Button variant="secondary" size="sm" icon={<Play size={13} />} onClick={onStart}>
              重新开始
            </Button>
          )}
        </div>
      </div>

      <div className="run-log" ref={logRef} aria-live="polite">
        {run.logs.length === 0 ? (
          <div className="run-log__idle">
            {running ? (
              <>
                <Loader2 size={14} className="spin" /> 等待 ocr 输出…
              </>
            ) : (
              '没有更多日志。'
            )}
          </div>
        ) : (
          run.logs.map((log, index) => (
            <div key={index} className={`run-log__line is-${log.level}`}>
              <span>{new Date(log.at).toLocaleTimeString('zh-CN', { hour12: false })}</span>
              <code>{log.line}</code>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export default function ReviewPage({
  repo,
  gitStatus,
  form,
  run,
  preview,
  onClosePreview,
  onCancel,
  onStart,
  onOpenHistory,
  latestSession,
  onOpenSettings,
  hasProvider
}: {
  repo: string
  gitStatus: GitStatus | null
  form: FormState
  run: RunState
  preview: PreviewState
  onClosePreview: () => void
  onCancel: () => void
  onStart: () => void
  onOpenHistory: () => void
  latestSession: SessionSummary | null
  onOpenSettings: () => void
  hasProvider: boolean
}): React.JSX.Element {
  const toast = useToast()
  const headline = headlines[form.mode] ?? headlines.workspace
  const status = statusView(run)
  const result = run.result

  const range = useMemo(() => {
    if (form.mode === 'branch') return `${form.from || '…'} → ${form.to || '工作区'}`
    if (form.mode === 'commit') return form.commit || '未选择提交'
    if (form.mode === 'scan') return form.paths || '整个仓库'
    return gitStatus?.isRepo ? `${gitStatus.changes} 个更改 · +${gitStatus.insertions} −${gitStatus.deletions}` : '工作区'
  }, [form, gitStatus])

  async function saveMarkdown(): Promise<void> {
    if (!result) return
    const content = buildMarkdown(result, repo, result.session_id)
    const saved = await window.ocr.shell.saveFile({
      defaultName: `opencodereview-${Date.now()}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      content
    })
    if (saved.saved) toast.push(`已保存到 ${saved.path}`, 'success')
  }

  async function saveJson(): Promise<void> {
    if (!result) return
    const saved = await window.ocr.shell.saveFile({
      defaultName: `opencodereview-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
      content: JSON.stringify(result, null, 2)
    })
    if (saved.saved) toast.push(`已保存到 ${saved.path}`, 'success')
  }

  async function saveHtml(): Promise<void> {
    if (!result?.session_id) {
      toast.push('当前结果没有关联的会话，无法导出 HTML', 'error')
      return
    }
    try {
      const saved = await window.ocr.sessions.exportHtml(repo, result.session_id)
      if (saved.saved) toast.push(`已导出 ${saved.path}`, 'success')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  async function copyMarkdown(): Promise<void> {
    if (!result) return
    await window.ocr.shell.copyText(buildMarkdown(result, repo, result.session_id))
    toast.push('已复制 Markdown 报告', 'success')
  }

  const showResult = Boolean(result) && run.state !== 'running'
  const showError = !showResult && (run.state === 'failed' || run.state === 'cancelled')

  return (
    <div className="review-page">
      <header className="page-head">
        <div className="page-head__copy">
          <div className="page-head__meta">
            <Chip tone={status.tone}>{status.label}</Chip>
            <span>{modeLabel(form.mode)}</span>
            <span className="page-head__dot">·</span>
            <span className="mono">{range}</span>
          </div>
          <h2>{headline.title}</h2>
          <p>{headline.note}</p>
        </div>

        <div className="page-head__actions">
          {showResult ? (
            <>
              <details className="menu">
                <summary className="btn btn--secondary btn--sm">
                  <Download size={14} />
                  导出
                </summary>
                <div className="menu__list">
                  <button onClick={() => void copyMarkdown()}>
                    <Copy size={13} />
                    复制 Markdown
                  </button>
                  <button onClick={() => void saveMarkdown()}>
                    <FileDown size={13} />
                    保存 Markdown
                  </button>
                  <button onClick={() => void saveJson()}>
                    <FileDown size={13} />
                    保存 JSON
                  </button>
                  <button onClick={() => void saveHtml()}>
                    <FileDown size={13} />
                    导出独立 HTML
                  </button>
                </div>
              </details>
              <Button variant="secondary" size="sm" icon={<Play size={13} />} onClick={onStart}>
                重新审查
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {!hasProvider ? (
        <button className="notice-bar" onClick={onOpenSettings}>
          <TriangleAlert size={16} />
          <span>
            <strong>还没有配置模型服务。</strong>
            先在设置中选择服务商并填写 API Key，审查才能运行。
          </span>
          <ArrowRight size={15} />
        </button>
      ) : null}

      {run.state === 'running' || showError ? (
        <RunPanel run={run} onCancel={onCancel} onStart={onStart} />
      ) : null}

      {showResult && result ? (
        <>
          <SummaryStrip result={result} />
          <FindingsLedger
            comments={result.comments}
            repo={repo}
            identity={result.session_id ?? result.run?.id ?? 'run'}
            onToast={(text, tone) => toast.push(text, tone)}
          />
        </>
      ) : null}

      {!showResult && run.state !== 'running' && !showError ? (
        <section className="idle">
          <div className="idle__mark">
            <span className="idle__line" />
            <span className="idle__line idle__line--short" />
            <span className="idle__line" />
            <span className="idle__line idle__line--short" />
          </div>
          <h3>准备一次有据可查的审查</h3>
          <p>
            在左侧选择审查范围后开始。审查代理会读取完整文件、在仓库中搜索上下文，并为每条发现标注精确的行号。
          </p>
          <Button variant="primary" icon={<Play size={15} fill="currentColor" />} onClick={onStart}>
            开始审查
          </Button>

          {latestSession ? (
            <button className="last-session" onClick={onOpenHistory}>
              <span className="last-session__icon">
                <History size={16} />
              </span>
              <span className="last-session__copy">
                <strong>上次审查 · {relativeTime(latestSession.start_time)}</strong>
                <small>
                  {sessionRange(latestSession)} · {latestSession.total_comments} 条发现 ·{' '}
                  {latestSession.model || '未知模型'}
                </small>
              </span>
              <ArrowRight size={15} />
            </button>
          ) : (
            <p className="idle__hint">
              <CheckCircle2 size={14} /> 结果会保存在本机会话目录，随时可以回看或对比。
            </p>
          )}

          <p className="idle__command">
            <Terminal size={13} /> 实际执行：<code>ocr {form.mode === 'scan' ? 'scan' : 'review'} --format json</code>
          </p>
        </section>
      ) : null}

      <Modal
        open={preview.open}
        title="即将审查的文件"
        subtitle={preview.command}
        onClose={onClosePreview}
        wide
        footer={
          <Button variant="secondary" onClick={onClosePreview}>
            关闭
          </Button>
        }
      >
        {preview.loading ? (
          <div className="preview-loading">
            <Spinner label="正在计算审查范围…" />
          </div>
        ) : preview.ok ? (
          <pre className="preview-output">{preview.text}</pre>
        ) : (
          <div className="preview-error">
            <TriangleAlert size={18} />
            <p>{preview.error || '预览失败'}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}
