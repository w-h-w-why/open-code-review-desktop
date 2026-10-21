// Shared contract between the Electron main process and the renderer.

export type ReviewMode = 'workspace' | 'branch' | 'commit' | 'scan'
export type ReviewRunState = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Category =
  | 'bug'
  | 'security'
  | 'performance'
  | 'maintainability'
  | 'test'
  | 'style'
  | 'documentation'
  | 'other'

export interface ReviewComment {
  path: string
  content: string
  suggestion_code?: string
  existing_code?: string
  start_line: number
  end_line: number
  thinking?: string
  category?: Category | string
  severity?: Severity | string
}

export interface ReviewSummary {
  files_reviewed: number
  comments: number
  total_tokens: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  elapsed: string
  budget_exceeded?: boolean
}

export interface ReviewWarning {
  type: string
  file?: string
  message: string
}

export interface RunManifest {
  schema_version?: string
  run_id?: string
  parent_run_id?: string
  operation?: string
  terminal_state?: string
  elapsed_ms?: number
  coverage?: {
    selected?: number
    completed?: number
    reused?: number
    failed?: number
    waived?: number
    items?: ManifestItem[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ManifestItem {
  item_id?: string
  path?: string
  state?: string
  reason?: string
  [key: string]: unknown
}

export interface ReviewResult {
  status: string
  llm?: { provider?: string; model: string }
  trace_id?: string
  message?: string
  summary?: ReviewSummary
  tool_calls?: {
    total: number
    by_tool: Record<string, number>
    failure: number
    failure_by_tool: Record<string, number>
    failure_details: unknown[]
  }
  comments: ReviewComment[]
  groups?: unknown[]
  warnings?: ReviewWarning[]
  project_summary?: string
  session_id?: string
  manifest?: RunManifest
  retry_report?: unknown
  /** Added by the desktop app. */
  run?: RunMeta
}

export interface RunMeta {
  id: string
  repo: string
  mode: ReviewMode
  from?: string
  to?: string
  commit?: string
  paths?: string
  resume?: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  exitCode?: number | null
  aborted?: boolean
  command: string[]
  provider?: string
  model?: string
}

export interface ReviewOptions {
  background?: string
  effort?: string
  concurrency?: number
  maxTokens?: number
  maxTokensBudget?: number
  model?: string
  provider?: string
  exclude?: string
  noFilter?: boolean
}

export interface ReviewRequest {
  repo: string
  mode: ReviewMode
  from?: string
  to?: string
  commit?: string
  paths?: string
  resume?: string
  options?: ReviewOptions
}

export type ReviewEvent =
  | {
      runId: string
      type: 'log'
      line: string
      level: 'info' | 'warn' | 'error'
      at: number
    }
  | {
      runId: string
      type: 'state'
      state: ReviewRunState
      message?: string
    }
  | {
      runId: string
      type: 'result'
      result: ReviewResult
    }

export interface StartReviewResponse {
  runId: string
}

export interface PreviewResponse {
  ok: boolean
  text: string
  command?: string
  error?: string
}

export interface ToolInfo {
  ok: boolean
  version?: string
  path?: string
}

export interface EnvCheck {
  node: ToolInfo
  npm: ToolInfo
  git: ToolInfo
  ocr: ToolInfo & { path?: string }
  ocrConfigPath: string
  hasConfig: boolean
  platform: string
}

export interface InstallEvent {
  line: string
  level: 'info' | 'error'
  done?: boolean
  ok?: boolean
}

export interface GitStatus {
  isRepo: boolean
  root: string
  branch: string
  upstream?: string
  ahead: number
  behind: number
  changes: number
  insertions: number
  deletions: number
  lastCommit?: {
    hash: string
    subject: string
    author: string
    relative: string
  }
  dirtyFiles: { path: string; status: string }[]
  error?: string
}

export interface BranchInfo {
  name: string
  current: boolean
  remote: boolean
}

export interface CommitInfo {
  hash: string
  subject: string
  author: string
  relative: string
}

export interface AppSettings {
  cliPath: string
  recentProjects: string[]
  defaultConcurrency: number
  defaultEffort: '' | 'low' | 'medium' | 'high'
  editorCommand: string
  autoRefreshGit: boolean
}

export interface ProviderInfo {
  name: string
  displayName: string
  protocol: string
  baseURL?: string
  envVar?: string
  models: string[]
  ambientAuth?: boolean
  externalAuth?: boolean
}

export interface ProviderConfigView {
  api_key?: string
  api_key_set: boolean
  base_url?: string
  protocol?: string
}

export interface OcrConfigView {
  path: string
  exists: boolean
  provider: string
  model: string
  language: string
  effort: string
  maxTokens: number
  providers: Record<string, ProviderConfigView>
  customProviders: Record<string, ProviderConfigView>
  llm?: {
    url?: string
    model?: string
    protocol?: string
  }
  raw: Record<string, unknown>
}

export interface SaveProviderRequest {
  provider: string
  model: string
  apiKey?: string
  custom: boolean
  baseURL?: string
  protocol?: string
}

export interface SavePreferencesRequest {
  language?: string
  effort?: string
  maxTokens?: number
  concurrency?: number
}

export interface TestConnectionRequest {
  draft?: SaveProviderRequest
}

export interface TestConnectionResult {
  ok: boolean
  message: string
  output?: string
}

export interface SessionSummary {
  session_id: string
  file_path: string
  repo_dir: string
  git_branch?: string
  model?: string
  review_mode?: string
  diff_from?: string
  diff_to?: string
  diff_commit?: string
  resumed_from?: string
  start_time: string
  end_time?: string
  duration_ns?: number
  selected_files: number
  completed_files: number
  failed_files: number
  reused_files: number
  waived_files: number
  total_comments: number
  llm_failures: number
  aborted: boolean
  legacy: boolean
  run_manifest?: RunManifest
}

export interface SessionItem {
  type: string
  timestamp: string
  file_path: string
  old_path?: string
  new_path?: string
  fingerprint?: string
  comments: number
  source_session_id?: string
  error?: string
}

export interface SessionDetail {
  summary: SessionSummary
  items: SessionItem[]
}

export interface CompareSide {
  session_id: string
  review_mode?: string
  range?: string
}

export interface CompareResult {
  before: CompareSide
  after: CompareSide
  new: ReviewComment[]
  persisting: ReviewComment[]
  resolved: ReviewComment[]
  not_reviewed: ReviewComment[]
}

export interface SaveFileRequest {
  defaultName: string
  filters: { name: string; extensions: string[] }[]
  content: string
}

export interface SaveFileResult {
  saved: boolean
  path?: string
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  userData: string
  sessionsRoot: string
}

export interface OcrApi {
  env: {
    check(force?: boolean): Promise<EnvCheck>
    install(onEvent: (e: InstallEvent) => void): Promise<boolean>
  }
  settings: {
    get(): Promise<AppSettings>
    save(patch: Partial<AppSettings>): Promise<AppSettings>
    pickDirectory(): Promise<string | null>
    addProject(dir: string): Promise<{ root: string; settings: AppSettings }>
    removeProject(dir: string): Promise<AppSettings>
  }
  git: {
    status(repo: string): Promise<GitStatus>
    branches(repo: string): Promise<BranchInfo[]>
    commits(repo: string, limit?: number): Promise<CommitInfo[]>
  }
  config: {
    read(): Promise<OcrConfigView>
    saveProvider(req: SaveProviderRequest): Promise<OcrConfigView>
    savePreferences(req: SavePreferencesRequest): Promise<OcrConfigView>
    saveRaw(json: string): Promise<OcrConfigView>
    renameCustomProvider(oldName: string, newName: string): Promise<OcrConfigView>
    migrateCustomProvider(name: string): Promise<OcrConfigView>
    testConnection(req?: TestConnectionRequest): Promise<TestConnectionResult>
    providers(): Promise<ProviderInfo[]>
  }
  review: {
    start(req: ReviewRequest): Promise<StartReviewResponse>
    cancel(runId: string): Promise<void>
    preview(req: ReviewRequest): Promise<PreviewResponse>
    onEvent(cb: (e: ReviewEvent) => void): () => void
  }
  sessions: {
    list(repo: string): Promise<SessionSummary[]>
    show(repo: string, sessionId: string): Promise<SessionDetail>
    comments(repo: string, sessionId: string): Promise<ReviewComment[]>
    compare(repo: string, before: string, after: string): Promise<CompareResult>
    remove(sessionId: string): Promise<void>
    exportHtml(
      repo: string,
      sessionId: string
    ): Promise<{ saved: boolean; path?: string }>
  }
  shell: {
    openPath(path: string): Promise<void>
    revealPath(path: string): Promise<void>
    openInEditor(repo: string, file: string, line?: number): Promise<boolean>
    openExternal(url: string): Promise<void>
    copyText(text: string): Promise<void>
    saveFile(req: SaveFileRequest): Promise<SaveFileResult>
  }
  app: {
    info(): Promise<AppInfo>
    cliPath(): Promise<string>
    openSessionsFolder(): Promise<void>
    openConfigFolder(): Promise<void>
  }
}
