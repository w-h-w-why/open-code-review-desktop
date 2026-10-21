import { AlertTriangle, GitBranch, RefreshCw } from 'lucide-react'
import type { GitStatus } from '@shared/types'
import type { Page } from '../types'
import { IconButton } from './ui'

const titles: Record<Page, { title: string; note: string }> = {
  review: { title: '代码审查', note: '选择范围，交给审查代理' },
  history: { title: '历史会话', note: '回看、对比与继续此前的审查' },
  settings: { title: '设置', note: '模型服务与审查偏好' }
}

export default function TopBar({
  page,
  project,
  gitStatus,
  loading,
  onRefresh,
  hasProvider,
  onOpenSettings
}: {
  page: Page
  project: string
  gitStatus: GitStatus | null
  loading: boolean
  onRefresh: () => void
  hasProvider: boolean
  onOpenSettings: () => void
}): React.JSX.Element {
  const meta = titles[page]

  return (
    <header className="topbar">
      <div className="topbar__title">
        <h1>{meta.title}</h1>
        <p>{project ? meta.note : '打开一个仓库后开始'}</p>
      </div>

      <div className="topbar__right">
        {!hasProvider ? (
          <button className="topbar__warning" onClick={onOpenSettings}>
            <AlertTriangle size={14} />
            尚未配置模型
          </button>
        ) : null}

        {gitStatus?.isRepo ? (
          <div className="topbar__git">
            <span className="git-ref" title={gitStatus.upstream ? `上游 ${gitStatus.upstream}` : '本地分支'}>
              <GitBranch size={13} />
              {gitStatus.branch}
              {gitStatus.ahead || gitStatus.behind ? (
                <span className="git-ref__track">
                  {gitStatus.ahead ? `↑${gitStatus.ahead}` : ''}
                  {gitStatus.behind ? `↓${gitStatus.behind}` : ''}
                </span>
              ) : null}
            </span>
            <span className="git-change">
              <span>{gitStatus.changes} 个文件</span>
              <span className="diff-add">+{gitStatus.insertions}</span>
              <span className="diff-del">−{gitStatus.deletions}</span>
            </span>
            <IconButton label="刷新 Git 状态" onClick={onRefresh} className={loading ? 'is-spinning' : ''}>
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </IconButton>
          </div>
        ) : project && gitStatus ? (
          <span className="topbar__norepo">不是 Git 仓库</span>
        ) : null}
      </div>
    </header>
  )
}
