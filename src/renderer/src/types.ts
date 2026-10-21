import type { ReviewMode, ReviewResult, ReviewRunState } from '@shared/types'

export type Page = 'review' | 'history' | 'settings'

export interface LogLine {
  line: string
  level: 'info' | 'warn' | 'error'
  at: number
}

export interface RunState {
  runId: string | null
  state: ReviewRunState
  logs: LogLine[]
  result: ReviewResult | null
  error?: string
  startedAt?: number
  command?: string[]
}

export interface FormState {
  mode: ReviewMode
  from: string
  to: string
  commit: string
  paths: string
  background: string
  effort: '' | 'low' | 'medium' | 'high'
  concurrency: number
  maxTokensBudget: number
  model: string
  provider: string
  exclude: string
  noFilter: boolean
}

export interface PreviewState {
  open: boolean
  loading: boolean
  ok: boolean
  text: string
  command?: string
  error?: string
}
