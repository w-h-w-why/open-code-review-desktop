import { CircleHelp, History, ScanSearch, Settings2 } from 'lucide-react'
import logo from '../assets/logo.svg'
import type { Page } from '../types'

const items: { page: Page; label: string; icon: React.JSX.Element }[] = [
  { page: 'review', label: '审查', icon: <ScanSearch size={20} strokeWidth={1.8} /> },
  { page: 'history', label: '历史', icon: <History size={20} strokeWidth={1.8} /> },
  { page: 'settings', label: '设置', icon: <Settings2 size={20} strokeWidth={1.8} /> }
]

export default function IconRail({
  page,
  onNavigate,
  onHelp
}: {
  page: Page
  onNavigate: (page: Page) => void
  onHelp: () => void
}): React.JSX.Element {
  return (
    <aside className="rail">
      <div className="rail__brand" title="OpenCodeReview">
        <img src={logo} alt="OpenCodeReview" width={26} height={26} />
      </div>

      <nav className="rail__nav" aria-label="主导航">
        {items.map((item) => (
          <button
            key={item.page}
            className={`rail__item ${page === item.page ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.page)}
            aria-current={page === item.page ? 'page' : undefined}
            title={item.label}
          >
            <span className="rail__icon">{item.icon}</span>
            <span className="rail__label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="rail__spacer" />

      <button className="rail__item rail__item--quiet" onClick={onHelp} title="使用文档">
        <span className="rail__icon">
          <CircleHelp size={19} strokeWidth={1.8} />
        </span>
        <span className="rail__label">帮助</span>
      </button>
    </aside>
  )
}
