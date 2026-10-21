import { useState } from 'react'
import {
  ChevronDown,
  FolderGit2,
  FolderOpen,
  GitBranch,
  History,
  Plus,
  Settings2,
  X
} from 'lucide-react'
import type {
  AppSettings,
  BranchInfo,
  CommitInfo,
  GitStatus,
  OcrConfigView,
  ProviderInfo,
  SessionSummary
} from '@shared/types'
import type { FormState, Page } from '../types'
import ReviewForm from './ReviewForm'
import { Button, Chip } from './ui'
import { basename, modeLabel, relativeTime, sessionRange } from '../utils/format'

export default function ProjectPanel({
  page,
  settings,
  config,
  activeProject,
  gitStatus,
  gitLoading,
  form,
  setForm,
  branches,
  commits,
  providers,
  running,
  onOpenProject,
  onSelectProject,
  onRemoveProject,
  onRefreshGit,
  onStart,
  onPreview,
  latestSession,
  onOpenHistory
}: {
  page: Page
  settings: AppSettings | null
  config: OcrConfigView | null
  activeProject: string
  gitStatus: GitStatus | null
  gitLoading: boolean
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  branches: BranchInfo[]
  commits: CommitInfo[]
  providers: ProviderInfo[]
  running: boolean
  onOpenProject: () => void
  onSelectProject: (repo: string) => void
  onRemoveProject: (repo: string) => void
  onRefreshGit: () => void
  onStart: () => void
  onPreview: () => void
  latestSession: SessionSummary | null
  onOpenHistory: () => void
}): React.JSX.Element {
  const [switchOpen, setSwitchOpen] = useState(false)
  const recent = settings?.recentProjects ?? []
  const activeProviderIsBuiltIn = Boolean(
    config?.provider && providers.some((provider) => provider.name === config.provider)
  )
  const activeKey = config?.provider
    ? activeProviderIsBuiltIn
      ? config.providers[config.provider]?.api_key
      : config.customProviders[config.provider]?.api_key
    : undefined

  return (
    <aside className="panel">
      <div className="panel__scroll">
        <section className="panel-section panel-section--project">
          <div className="section-label">
            项目
            <button className="section-label__action" onClick={onOpenProject}>
              <Plus size={13} />
              打开
            </button>
          </div>

          {activeProject ? (
            <div className="project-switch">
              <button className="project-card" onClick={() => setSwitchOpen((open) => !open)}>
                <span className="project-card__icon">
                  <FolderGit2 size={17} />
                </span>
                <span className="project-card__copy">
                  <strong>{basename(activeProject)}</strong>
                  <small title={activeProject}>{activeProject}</small>
                </span>
                <ChevronDown size={15} className={switchOpen ? 'is-flipped' : ''} />
              </button>

              {switchOpen ? (
                <>
                  <div className="popover-backdrop" onClick={() => setSwitchOpen(false)} />
                  <div className="project-popover">
                    <div className="project-popover__head">最近项目</div>
                    {recent.length === 0 ? (
                      <p className="project-popover__empty">还没有打开过仓库</p>
                    ) : (
                      recent.map((repo) => (
                        <div
                          key={repo}
                          className={`project-option ${repo === activeProject ? 'is-active' : ''}`}
                        >
                          <button
                            className="project-option__main"
                            onClick={() => {
                              onSelectProject(repo)
                              setSwitchOpen(false)
                            }}
                            title={repo}
                          >
                            <span>{basename(repo)}</span>
                            <small>{repo}</small>
                          </button>
                          <button
                            className="project-option__remove"
                            title="从最近项目中移除"
                            aria-label="从最近项目中移除"
                            onClick={() => onRemoveProject(repo)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))
                    )}
                    <button
                      className="project-popover__action"
                      onClick={() => {
                        setSwitchOpen(false)
                        onOpenProject()
                      }}
                    >
                      <FolderOpen size={14} />
                      打开本地仓库
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <Button variant="primary" icon={<FolderOpen size={16} />} onClick={onOpenProject} className="btn--block">
              打开本地仓库
            </Button>
          )}

          {gitStatus?.isRepo ? (
            <div className="project-meta">
              <span className="project-meta__branch">
                <GitBranch size={12} />
                {gitStatus.branch}
              </span>
              <span>{gitStatus.changes} 个更改</span>
              <span className="diff-add">+{gitStatus.insertions}</span>
              <span className="diff-del">−{gitStatus.deletions}</span>
            </div>
          ) : activeProject && gitStatus ? (
            <p className="panel-note panel-note--warn">这个目录不是 Git 仓库。</p>
          ) : activeProject ? (
            <p className="panel-note">正在读取仓库状态…</p>
          ) : null}
        </section>

        {page === 'review' && activeProject ? (
          <ReviewForm
            form={form}
            setForm={setForm}
            branches={branches}
            commits={commits}
            config={config}
            providers={providers}
            running={running}
            onStart={onStart}
            onPreview={onPreview}
            currentBranch={gitStatus?.branch}
          />
        ) : null}

        {page === 'history' ? (
          <section className="panel-section">
            <div className="section-label">最近一次</div>
            {latestSession ? (
              <button className="mini-session" onClick={onOpenHistory}>
                <div className="mini-session__top">
                  <span>{modeLabel(latestSession.review_mode)}</span>
                  <span>{relativeTime(latestSession.start_time)}</span>
                </div>
                <strong>{sessionRange(latestSession)}</strong>
                <div className="mini-session__foot">
                  <span>{latestSession.total_comments} 条发现</span>
                  <span>{latestSession.completed_files} 个文件</span>
                </div>
              </button>
            ) : (
              <p className="panel-note">还没有会话记录。</p>
            )}
            <Button variant="secondary" icon={<History size={15} />} onClick={onOpenHistory} className="btn--block">
              查看全部会话
            </Button>
            <p className="panel-note" style={{ marginTop: 12 }}>
              在会话列表勾选两条记录，可以对比新增、仍存在与已解决的问题。
            </p>
          </section>
        ) : null}

        {page === 'settings' ? (
          <section className="panel-section">
            <div className="section-label">当前模型</div>
            {config?.provider ? (
              <div className="config-summary">
                <div className="config-summary__row">
                  <span>服务商</span>
                  <strong>{config.provider}</strong>
                </div>
                <div className="config-summary__row">
                  <span>模型</span>
                  <strong>{config.model || '未指定'}</strong>
                </div>
                <div className="config-summary__row">
                  <span>密钥</span>
                  <Chip
                    tone={
                      activeKey || config.provider === 'bedrock' ? 'green' : 'amber'
                    }
                  >
                    {activeKey ?? (config.provider === 'bedrock' ? '环境凭证' : '未配置')}
                  </Chip>
                </div>
              </div>
            ) : (
              <p className="panel-note panel-note--warn">还没有配置模型服务。</p>
            )}
            <Button
              variant="secondary"
              icon={<Settings2 size={15} />}
              onClick={() => window.ocr.app.openConfigFolder()}
              className="btn--block"
            >
              打开配置目录
            </Button>
            {gitLoading ? <p className="panel-note">正在刷新 Git 状态…</p> : null}
            {activeProject ? (
              <button className="link-btn link-btn--small" onClick={onRefreshGit}>
                刷新仓库状态
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
    </aside>
  )
}
