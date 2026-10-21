import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[ocr-desktop] render error', error)
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="crash">
        <div className="crash__panel">
          <AlertTriangle size={22} />
          <h1>界面遇到一个错误</h1>
          <p>
            这通常来自一条格式异常的审查结果。会话文件没有被修改，可以重新加载界面继续。
          </p>
          <pre>{this.state.error.message}</pre>
          <button className="btn btn--primary btn--md" onClick={() => window.location.reload()}>
            <RotateCcw size={15} />
            重新加载界面
          </button>
        </div>
      </div>
    )
  }
}
