import { useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  Eye,
  FileSearch2,
  GitCommitHorizontal,
  GitCompareArrows,
  Laptop,
  Play
} from 'lucide-react'
import type {
  BranchInfo,
  CommitInfo,
  OcrConfigView,
  ProviderInfo,
  ReviewMode
} from '@shared/types'
import type { FormState } from '../types'
import { Button, Collapse, Field } from './ui'

const modes: {
  value: ReviewMode
  label: string
  desc: string
  icon: React.JSX.Element
}[] = [
  {
    value: 'workspace',
    label: '工作区更改',
    desc: '已暂存、未暂存与未跟踪',
    icon: <Laptop size={16} strokeWidth={1.8} />
  },
  {
    value: 'branch',
    label: '分支对比',
    desc: '两个引用之间的差异',
    icon: <GitCompareArrows size={16} strokeWidth={1.8} />
  },
  {
    value: 'commit',
    label: '单次提交',
    desc: '提交与其父提交',
    icon: <GitCommitHorizontal size={16} strokeWidth={1.8} />
  },
  {
    value: 'scan',
    label: '全量扫描',
    desc: '不看 diff，审查完整文件',
    icon: <FileSearch2 size={16} strokeWidth={1.8} />
  }
]

export default function ReviewForm({
  form,
  setForm,
  branches,
  commits,
  config,
  providers,
  running,
  onStart,
  onPreview,
  currentBranch
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  branches: BranchInfo[]
  commits: CommitInfo[]
  config: OcrConfigView | null
  providers: ProviderInfo[]
  running: boolean
  onStart: () => void
  onPreview: () => void
  currentBranch?: string
}): React.JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [backgroundOpen, setBackgroundOpen] = useState(false)

  const branchNames = useMemo(() => branches.map((b) => b.name), [branches])

  function selectMode(mode: ReviewMode): void {
    setForm((current) => {
      const next = { ...current, mode }
      if (mode === 'branch' && !current.from && !current.to) {
        const base =
          ['main', 'master', 'develop', 'dev'].find((name) => branchNames.includes(name)) ||
          branchNames.find((name) => name !== currentBranch) ||
          ''
        next.from = base
        next.to = currentBranch ?? ''
      }
      return next
    })
  }

  function swap(): void {
    setForm((current) => ({ ...current, from: current.to, to: current.from }))
  }

  const activeModel = config?.model || '未配置模型'
  const advancedHint = `${form.effort ? `${form.effort === 'low' ? '低' : form.effort === 'medium' ? '中' : '高'}力度` : '默认力度'} · ${form.concurrency} 并发`

  return (
    <div className="review-form">
      <section className="panel-section">
        <div className="section-label">审查范围</div>
        <div className="mode-list" role="radiogroup" aria-label="审查范围">
          {modes.map((mode) => (
            <button
              key={mode.value}
              role="radio"
              aria-checked={form.mode === mode.value}
              className={`mode-item ${form.mode === mode.value ? 'is-active' : ''}`}
              onClick={() => selectMode(mode.value)}
              disabled={running}
            >
              <span className="mode-item__icon">{mode.icon}</span>
              <span className="mode-item__copy">
                <strong>{mode.label}</strong>
                <small>{mode.desc}</small>
              </span>
              <span className="mode-item__mark" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      {form.mode === 'branch' ? (
        <section className="panel-section">
          <div className="field-row">
            <Field label="起点">
              <input
                list="ocr-branches"
                value={form.from}
                placeholder="main"
                onChange={(event) => setForm((c) => ({ ...c, from: event.target.value }))}
                disabled={running}
              />
            </Field>
            <button className="swap-btn" onClick={swap} title="交换起止引用" aria-label="交换起止引用">
              <ArrowRightLeft size={14} />
            </button>
            <Field label="终点">
              <input
                list="ocr-branches"
                value={form.to}
                placeholder="feature-branch"
                onChange={(event) => setForm((c) => ({ ...c, to: event.target.value }))}
                disabled={running}
              />
            </Field>
          </div>
          <datalist id="ocr-branches">
            {branchNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="field-note">留空一端时，另一端会与工作区或当前 HEAD 比较。</p>
        </section>
      ) : null}

      {form.mode === 'commit' ? (
        <section className="panel-section">
          <Field label="提交哈希或标签">
            <input
              value={form.commit}
              placeholder="例如 a1b2c3d"
              onChange={(event) => setForm((c) => ({ ...c, commit: event.target.value }))}
              disabled={running}
            />
          </Field>
          {commits.length > 0 ? (
            <div className="commit-list">
              {commits.slice(0, 5).map((commit) => (
                <button
                  key={commit.hash}
                  className={`commit-item ${form.commit === commit.hash ? 'is-active' : ''}`}
                  onClick={() => setForm((c) => ({ ...c, commit: commit.hash }))}
                  disabled={running}
                >
                  <code>{commit.hash}</code>
                  <span>{commit.subject}</span>
                  <small>{commit.relative}</small>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {form.mode === 'scan' ? (
        <section className="panel-section">
          <Field label="扫描路径" hint="逗号分隔的仓库相对路径；留空扫描整个仓库。">
            <input
              value={form.paths}
              placeholder="src/, internal/agent"
              onChange={(event) => setForm((c) => ({ ...c, paths: event.target.value }))}
              disabled={running}
            />
          </Field>
        </section>
      ) : null}

      <section className="panel-section panel-section--tight">
        <button
          className={`text-toggle ${backgroundOpen ? 'is-open' : ''}`}
          onClick={() => setBackgroundOpen((open) => !open)}
          disabled={running}
        >
          <span>业务背景</span>
          <small>可选</small>
          <span aria-hidden="true">{backgroundOpen ? '−' : '+'}</span>
        </button>
        {backgroundOpen ? (
          <textarea
            rows={4}
            value={form.background}
            placeholder="说明需求、约束或重点关注的问题，帮助模型聚焦。"
            onChange={(event) => setForm((c) => ({ ...c, background: event.target.value }))}
            disabled={running}
          />
        ) : null}
      </section>

      <Collapse
        title="高级选项"
        hint={advancedHint}
        open={advancedOpen}
        onToggle={() => setAdvancedOpen((open) => !open)}
      >
        <div className="field-row">
          <Field label="审查力度">
            <select
              value={form.effort}
              onChange={(event) =>
                setForm((c) => ({ ...c, effort: event.target.value as FormState['effort'] }))
              }
              disabled={running}
            >
              <option value="">跟随配置</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </Field>
          <Field label="并发数">
            <input
              type="number"
              min={1}
              max={32}
              value={form.concurrency}
              onChange={(event) =>
                setForm((c) => ({ ...c, concurrency: Number(event.target.value) || 1 }))
              }
              disabled={running}
            />
          </Field>
        </div>

        <Field label="Token 预算" hint="0 表示不限制；超出预算时保留已完成的结果。">
          <input
            type="number"
            min={0}
            step={1000}
            value={form.maxTokensBudget || ''}
            placeholder="不限制"
            onChange={(event) =>
              setForm((c) => ({ ...c, maxTokensBudget: Number(event.target.value) || 0 }))
            }
            disabled={running}
          />
        </Field>

        <Field label="模型覆盖" hint={`留空使用配置中的模型：${activeModel}`}>
          <input
            value={form.model}
            placeholder={config?.model || '例如 claude-sonnet-5'}
            onChange={(event) => setForm((c) => ({ ...c, model: event.target.value }))}
            disabled={running}
          />
        </Field>

        <Field label="服务商覆盖">
          <select
            value={form.provider}
            onChange={(event) => setForm((c) => ({ ...c, provider: event.target.value }))}
            disabled={running}
          >
            <option value="">跟随配置</option>
            {providers.map((provider) => (
              <option key={provider.name} value={provider.name}>
                {provider.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="排除规则" hint="gitignore 风格，逗号分隔；会与规则文件中的排除项合并。">
          <input
            value={form.exclude}
            placeholder="dist/**, **/*.min.js"
            onChange={(event) => setForm((c) => ({ ...c, exclude: event.target.value }))}
            disabled={running}
          />
        </Field>

        <label className="check-row">
          <input
            type="checkbox"
            checked={form.noFilter}
            onChange={(event) => setForm((c) => ({ ...c, noFilter: event.target.checked }))}
            disabled={running}
          />
          <span>
            跳过后置过滤
            <small>保留模型给出的全部发现，可能包含更多噪音。</small>
          </span>
        </label>
      </Collapse>

      <div className="form-actions">
        <Button
          variant="primary"
          icon={<Play size={15} fill="currentColor" />}
          onClick={onStart}
          disabled={running}
          loading={running}
        >
          {running ? '审查进行中' : '开始审查'}
        </Button>
        <Button variant="secondary" icon={<Eye size={15} />} onClick={onPreview} disabled={running}>
          预览文件
        </Button>
      </div>
    </div>
  )
}
