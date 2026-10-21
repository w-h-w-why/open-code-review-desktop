import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Download,
  Loader2,
  RefreshCw,
  Terminal,
  X
} from 'lucide-react'
import type { EnvCheck, InstallEvent } from '@shared/types'
import logo from '../assets/logo.svg'
import { Button, Chip } from './ui'

interface LogLine {
  line: string
  level: 'info' | 'error'
}

export default function SetupGate({
  env,
  force,
  onClose,
  onInstalled
}: {
  env: EnvCheck | null
  force?: boolean
  onClose?: () => void
  onInstalled: () => Promise<void> | void
}): React.JSX.Element {
  const [installing, setInstalling] = useState(false)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!logRef.current) return
    logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  async function install(): Promise<void> {
    setInstalling(true)
    setError(null)
    setLogs([])
    try {
      const ok = await window.ocr.env.install((event: InstallEvent) => {
        if (event.done) return
        setLogs((current) => [...current.slice(-400), { line: event.line, level: event.level }])
      })
      if (ok) {
        await onInstalled()
      } else {
        setError('安装没有完成。请检查网络或手动执行上方命令。')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstalling(false)
    }
  }

  async function recheck(): Promise<void> {
    setChecking(true)
    try {
      await onInstalled()
    } finally {
      setChecking(false)
    }
  }

  const tools = [
    { name: 'ocr', info: env?.ocr, required: true },
    { name: 'git', info: env?.git, required: true },
    { name: 'node', info: env?.node, required: true },
    { name: 'npm', info: env?.npm, required: true }
  ]

  return (
    <div className="setup">
      {force && onClose ? (
        <button className="setup__close" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>
      ) : null}

      <section className="setup__intro">
        <img src={logo} alt="" width={44} height={44} />
        <p className="setup__kicker">OpenCodeReview Desktop</p>
        <h1>把代码审查放回桌面。</h1>
        <p className="setup__lead">
          这个界面驱动本机的 <code>ocr</code> 命令行：读取 Git 差异、调用你配置的模型，并把每条发现留在可复查的会话里。
          安装一次即可，之后不需要打开终端。
        </p>

        <ol className="setup__steps">
          <li>
            <span>01</span>
            <div>
              <strong>安装 ocr 命令行</strong>
              <p>通过 npm 安装官方包，自动下载对应平台的二进制。</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>连接模型服务</strong>
              <p>在设置里选择服务商、填入 API Key，并测试连通性。</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>打开仓库开始审查</strong>
              <p>工作区、分支、提交或全量扫描，结果随时回看。</p>
            </div>
          </li>
        </ol>

        <button
          className="link-btn"
          onClick={() => window.ocr.shell.openExternal('https://open-codereview.ai/docs/installation')}
        >
          查看完整安装文档
          <ArrowUpRight size={14} />
        </button>
      </section>

      <section className="setup__panel">
        <header className="setup__panel-head">
          <div>
            <h2>环境检查</h2>
            <p>桌面端需要命令行工具与 Git 协作。</p>
          </div>
          <Chip tone={env?.ocr.ok ? 'green' : 'amber'}>
            {env?.ocr.ok ? '已就绪' : '待安装'}
          </Chip>
        </header>

        <div className="env-list">
          {tools.map((tool) => (
            <div className="env-row" key={tool.name}>
              <span className={`env-row__dot ${tool.info?.ok ? 'is-ok' : 'is-missing'}`} />
              <span className="env-row__name">{tool.name}</span>
              <span className="env-row__version">
                {tool.info?.ok ? tool.info.version ?? '已安装' : tool.required ? '未找到' : '可选'}
              </span>
              {tool.info?.ok ? <Check size={14} className="env-row__check" /> : <CircleAlert size={14} className="env-row__alert" />}
            </div>
          ))}
        </div>

        {env?.ocr.path ? (
          <p className="setup__path" title={env.ocr.path}>
            <Terminal size={13} />
            {env.ocr.path}
          </p>
        ) : null}

        <div className="setup__actions">
          <Button
            variant="primary"
            icon={<Download size={16} />}
            loading={installing}
            onClick={() => void install()}
          >
            {env?.ocr.ok ? '重新安装 / 更新 ocr' : '安装 ocr 命令行'}
          </Button>
          <Button
            variant="quiet"
            icon={<RefreshCw size={15} className={checking ? 'spin' : ''} />}
            loading={checking}
            onClick={() => void recheck()}
          >
            重新检测
          </Button>
        </div>

        {logs.length > 0 ? (
          <div className="setup__log" ref={logRef}>
            {logs.map((log, index) => (
              <div key={index} className={log.level === 'error' ? 'is-error' : ''}>
                {log.line}
              </div>
            ))}
            {installing ? (
              <div className="setup__log-wait">
                <Loader2 size={13} className="spin" /> 正在下载并安装…
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="setup__error">{error}</p> : null}

        <p className="setup__manual">
          也可以手动运行：
          <code>npm install -g @alibaba-group/open-code-review</code>
        </p>
      </section>
    </div>
  )
}
