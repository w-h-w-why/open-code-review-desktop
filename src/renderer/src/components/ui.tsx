import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode
} from 'react'
import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
export type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${className}`.trim()}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="spin" size={size === 'sm' ? 14 : 16} /> : icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <button className={`icon-btn ${className}`.trim()} title={label} aria-label={label} {...rest}>
      {children}
    </button>
  )
}

export function Spinner({ size = 18, label }: { size?: number; label?: string }): React.JSX.Element {
  return (
    <span className="spinner" role="status" aria-label={label ?? '加载中'}>
      <Loader2 className="spin" size={size} />
      {label ? <span>{label}</span> : null}
    </span>
  )
}

export function Chip({
  children,
  tone = 'neutral',
  title
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'muted'
  title?: string
}): React.JSX.Element {
  return (
    <span className={`chip chip--${tone}`} title={title}>
      {children}
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
  className = ''
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  )
}

export interface ToastMessage {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

interface ToastApi {
  push: (text: string, tone?: ToastMessage['tone']) => void
}

const ToastContext = createContext<ToastApi>({ push: () => undefined })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [messages, setMessages] = useState<ToastMessage[]>([])
  const counter = useRef(0)

  const push = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = ++counter.current
    setMessages((current) => [...current, { id, text, tone }].slice(-4))
    window.setTimeout(() => {
      setMessages((current) => current.filter((message) => message.id !== id))
    }, tone === 'error' ? 7000 : 3800)
  }, [])

  const api = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-host" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`toast toast--${message.tone}`}>
            {message.tone === 'success' ? (
              <Check size={15} />
            ) : message.tone === 'error' ? (
              <AlertTriangle size={15} />
            ) : (
              <Info size={15} />
            )}
            <span>{message.text}</span>
            <button
              className="toast__close"
              aria-label="关闭提示"
              onClick={() => setMessages((current) => current.filter((m) => m.id !== message.id))}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true">
        <header className="modal__head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <IconButton label="关闭" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action
}: {
  icon?: ReactNode
  title: string
  text?: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="empty">
      {icon ? <div className="empty__icon">{icon}</div> : null}
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  ariaLabel?: string
}): React.JSX.Element {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Collapse({
  title,
  hint,
  open,
  onToggle,
  children
}: {
  title: string
  hint?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <section className={`collapse ${open ? 'is-open' : ''}`}>
      <button className="collapse__head" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <span className="collapse__hint">{hint}</span>
        <span className="collapse__arrow" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? <div className="collapse__body">{children}</div> : null}
    </section>
  )
}
