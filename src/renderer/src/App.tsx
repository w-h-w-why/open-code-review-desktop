import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, FolderGit2 } from 'lucide-react'
import type {
  AppSettings,
  BranchInfo,
  CommitInfo,
  EnvCheck,
  GitStatus,
  OcrConfigView,
  ProviderInfo,
  ReviewEvent,
  ReviewMode,
  ReviewRequest,
  SessionSummary
} from '@shared/types'
import type { FormState, Page, PreviewState, RunState } from './types'
import IconRail from './components/IconRail'
import ProjectPanel from './components/ProjectPanel'
import TopBar from './components/TopBar'
import ReviewPage from './components/ReviewPage'
import HistoryPage from './components/HistoryPage'
import SettingsPage from './components/SettingsPage'
import SetupGate from './components/SetupGate'
import { Button, EmptyState, Spinner, useToast } from './components/ui'
import { sessionMode } from './utils/format'

const emptyRun: RunState = {
  runId: null,
  state: 'idle',
  logs: [],
  result: null
}

function defaultForm(settings?: AppSettings | null): FormState {
  return {
    mode: 'workspace',
    from: '',
    to: '',
    commit: '',
    paths: '',
    background: '',
    effort: (settings?.defaultEffort ?? '') as FormState['effort'],
    concurrency: settings?.defaultConcurrency ?? 8,
    maxTokensBudget: 0,
    model: '',
    provider: '',
    exclude: '',
    noFilter: false
  }
}

export default function App(): React.JSX.Element {
  const toast = useToast()
  const [booting, setBooting] = useState(true)
  const [env, setEnv] = useState<EnvCheck | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [config, setConfig] = useState<OcrConfigView | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [page, setPage] = useState<Page>('review')
  const [activeProject, setActiveProject] = useState('')
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [gitLoading, setGitLoading] = useState(false)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [commits, setCommits] = useState<CommitInfo[]>([])
  const [form, setForm] = useState<FormState>(() => defaultForm())
  const [run, setRun] = useState<RunState>(emptyRun)
  const [preview, setPreview] = useState<PreviewState>({
    open: false,
    loading: false,
    ok: false,
    text: ''
  })
  const [latestSession, setLatestSession] = useState<SessionSummary | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [historyReset, setHistoryReset] = useState(0)

  const runIdRef = useRef<string | null>(null)
  const acceptingEventsRef = useRef(false)
  const cancelledRunsRef = useRef<Set<string>>(new Set())
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [page])

  const boot = useCallback(async () => {
    setBootError(null)
    try {
      const [nextEnv, nextSettings, nextConfig, nextProviders] = await Promise.all([
        window.ocr.env.check(),
        window.ocr.settings.get(),
        window.ocr.config.read(),
        window.ocr.config.providers()
      ])
      setEnv(nextEnv)
      setSettings(nextSettings)
      setConfig(nextConfig)
      setProviders(nextProviders)
      setForm(defaultForm(nextSettings))
      const first = nextSettings.recentProjects[0]
      if (first) setActiveProject(first)
    } catch (error) {
      setBootError(error instanceof Error ? error.message : String(error))
    } finally {
      setBooting(false)
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  const refreshGit = useCallback(async (repo: string) => {
    if (!repo) {
      setGitStatus(null)
      setBranches([])
      setCommits([])
      return
    }
    setGitLoading(true)
    try {
      const [status, branchList, commitList] = await Promise.all([
        window.ocr.git.status(repo),
        window.ocr.git.branches(repo),
        window.ocr.git.commits(repo, 12)
      ])
      setGitStatus(status)
      setBranches(branchList)
      setCommits(commitList)
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setGitLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!activeProject) return
    if (settings?.autoRefreshGit !== false) void refreshGit(activeProject)
    window.ocr.sessions
      .list(activeProject)
      .then((sessions) => setLatestSession(Array.isArray(sessions) ? sessions[0] ?? null : null))
      .catch(() => setLatestSession(null))
  }, [activeProject, refreshGit, settings?.autoRefreshGit])

  useEffect(() => {
    return window.ocr.review.onEvent((event: ReviewEvent) => {
      if (cancelledRunsRef.current.has(event.runId)) return
      if (!acceptingEventsRef.current) return
      if (runIdRef.current && event.runId !== runIdRef.current) return
      if (!runIdRef.current) runIdRef.current = event.runId

      if (event.type === 'log') {
        setRun((current) => ({
          ...current,
          logs: [
            ...current.logs.slice(-1499),
            { line: event.line, level: event.level, at: event.at }
          ]
        }))
        return
      }
      if (event.type === 'state') {
        if (event.state !== 'running') acceptingEventsRef.current = false
        setRun((current) => ({
          ...current,
          state: event.state,
          error: event.state === 'failed' ? event.message : current.error
        }))
        return
      }
      if (event.type === 'result') {
        acceptingEventsRef.current = false
        setRun((current) => ({
          ...current,
          result: event.result,
          state: 'done',
          command: event.result.run?.command
        }))
        if (activeProject) {
          window.ocr.sessions
            .list(activeProject)
            .then((sessions) => setLatestSession(Array.isArray(sessions) ? sessions[0] ?? null : null))
            .catch(() => undefined)
        }
      }
    })
  }, [activeProject])

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = await window.ocr.settings.save(patch)
      setSettings(next)
      return next
    },
    []
  )

  const goToPage = useCallback((next: Page) => {
    if (next === 'history') setHistoryReset((value) => value + 1)
    setPage(next)
  }, [])

  const stopCurrentRun = useCallback(() => {
    acceptingEventsRef.current = false
    if (runIdRef.current) {
      cancelledRunsRef.current.add(runIdRef.current)
      void window.ocr.review.cancel(runIdRef.current)
      runIdRef.current = null
    }
  }, [])

  const openProject = useCallback(async () => {
    try {
      const dir = await window.ocr.settings.pickDirectory()
      if (!dir) return
      const { root, settings: nextSettings } = await window.ocr.settings.addProject(dir)
      stopCurrentRun()
      setSettings(nextSettings)
      setActiveProject(root)
      setPage('review')
      setRun(emptyRun)
      toast.push(`已打开 ${root}`, 'success')
    } catch (error) {
      toast.push(error instanceof Error ? error.message : String(error), 'error')
    }
  }, [stopCurrentRun, toast])

  const selectProject = useCallback(
    (repo: string) => {
      stopCurrentRun()
      setActiveProject(repo)
      setPage('review')
      setRun(emptyRun)
    },
    [stopCurrentRun]
  )

  const removeProject = useCallback(
    async (repo: string) => {
      const next = await window.ocr.settings.removeProject(repo)
      setSettings(next)
      if (activeProject === repo) {
        stopCurrentRun()
        setActiveProject(next.recentProjects[0] ?? '')
        setRun(emptyRun)
      }
    },
    [activeProject, stopCurrentRun]
  )

  const buildRequest = useCallback(
    (override?: Partial<ReviewRequest>): ReviewRequest => {
      const base: ReviewRequest = {
        repo: activeProject,
        mode: form.mode,
        from: form.mode === 'branch' ? form.from.trim() : undefined,
        to: form.mode === 'branch' ? form.to.trim() : undefined,
        commit: form.mode === 'commit' ? form.commit.trim() : undefined,
        paths: form.mode === 'scan' ? form.paths.trim() : undefined,
        options: {
          background: form.background.trim() || undefined,
          effort: form.effort || undefined,
          concurrency: form.concurrency || undefined,
          maxTokensBudget: form.maxTokensBudget || undefined,
          model: form.model.trim() || undefined,
          provider: form.provider.trim() || undefined,
          exclude: form.exclude.trim() || undefined,
          noFilter: form.noFilter || undefined
        }
      }
      return { ...base, ...override }
    },
    [activeProject, form]
  )

  const startReview = useCallback(
    async (override?: Partial<ReviewRequest>) => {
      if (!activeProject) {
        toast.push('请先打开一个 Git 仓库', 'error')
        return
      }
      if (run.state === 'running') return

      const request = buildRequest(override)
      if (request.mode === 'commit' && !request.commit) {
        toast.push('请填写要审查的提交哈希', 'error')
        return
      }
      if (request.mode === 'branch' && !request.from && !request.to) {
        toast.push('分支对比至少需要填写一个引用', 'error')
        return
      }

      runIdRef.current = null
      acceptingEventsRef.current = true
      setPage('review')
      setRun({
        runId: null,
        state: 'running',
        logs: [],
        result: null,
        startedAt: Date.now()
      })

      try {
        const { runId } = await window.ocr.review.start(request)
        runIdRef.current = runId
        setRun((current) => ({ ...current, runId }))
      } catch (error) {
        acceptingEventsRef.current = false
        setRun({
          runId: null,
          state: 'failed',
          logs: [],
          result: null,
          error: error instanceof Error ? error.message : String(error),
          startedAt: Date.now()
        })
      }
    },
    [activeProject, buildRequest, run.state, toast]
  )

  const cancelReview = useCallback(async () => {
    const runId = runIdRef.current ?? run.runId
    if (!runId) return
    acceptingEventsRef.current = false
    cancelledRunsRef.current.add(runId)
    runIdRef.current = null
    setRun((current) => ({ ...current, state: 'cancelled', error: undefined }))
    await window.ocr.review.cancel(runId)
  }, [run.runId])

  const previewReview = useCallback(async () => {
    if (!activeProject) {
      toast.push('请先打开一个 Git 仓库', 'error')
      return
    }
    setPreview({ open: true, loading: true, ok: false, text: '' })
    try {
      const request = buildRequest()
      if (request.mode === 'commit' && !request.commit) {
        setPreview({
          open: true,
          loading: false,
          ok: false,
          text: '',
          error: '请填写要审查的提交哈希'
        })
        return
      }
      const result = await window.ocr.review.preview(request)
      setPreview({
        open: true,
        loading: false,
        ok: result.ok,
        text: result.text,
        command: result.command,
        error: result.error
      })
    } catch (error) {
      setPreview({
        open: true,
        loading: false,
        ok: false,
        text: '',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }, [activeProject, buildRequest, toast])

  const reuseSession = useCallback(
    (session: SessionSummary, action: 'reuse' | 'resume') => {
      const mode = sessionMode(session) as ReviewMode
      const next: FormState = {
        ...form,
        mode,
        from: session.diff_from ?? '',
        to: session.diff_to ?? '',
        commit: session.diff_commit ?? ''
      }
      setForm(next)
      setPage('review')
      setRun(emptyRun)
      runIdRef.current = null
      if (action === 'resume') {
        toast.push('正在从上次检查点继续审查', 'info')
        void startReview({
          repo: activeProject,
          mode,
          from: next.from || undefined,
          to: next.to || undefined,
          commit: next.commit || undefined,
          resume: session.session_id
        })
      }
    },
    [activeProject, form, startReview, toast]
  )

  const hasProvider = useMemo(() => {
    if (!config) return false
    if (config.provider) {
      const isBuiltIn = providers.some((provider) => provider.name === config.provider)
      const entry = isBuiltIn
        ? config.providers[config.provider]
        : config.customProviders[config.provider]
      return Boolean(entry?.api_key_set || config.provider === 'bedrock')
    }
    return Boolean(config.llm?.url && config.llm?.model)
  }, [config, providers])

  if (booting) {
    return (
      <div className="boot">
        <div className="boot__mark">
          <Spinner size={22} />
        </div>
        <p>正在准备审查工作台…</p>
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="boot">
        <AlertTriangle size={26} />
        <h1>启动失败</h1>
        <p>{bootError}</p>
        <Button variant="primary" onClick={() => void boot()}>
          重试
        </Button>
      </div>
    )
  }

  if (!env?.ocr.ok || showSetup) {
    return (
      <SetupGate
        env={env}
        force={showSetup}
        onClose={() => setShowSetup(false)}
        onInstalled={async () => {
          const next = await window.ocr.env.check(true)
          setEnv(next)
          setShowSetup(false)
          if (next.ocr.ok) toast.push('ocr 命令行已就绪', 'success')
        }}
      />
    )
  }

  return (
    <div className="app">
      <IconRail page={page} onNavigate={goToPage} onHelp={() => window.ocr.shell.openExternal('https://open-codereview.ai/docs')} />

      <ProjectPanel
        page={page}
        settings={settings}
        config={config}
        activeProject={activeProject}
        gitStatus={gitStatus}
        gitLoading={gitLoading}
        form={form}
        setForm={setForm}
        branches={branches}
        commits={commits}
        providers={providers}
        running={run.state === 'running'}
        onOpenProject={() => void openProject()}
        onSelectProject={selectProject}
        onRemoveProject={(repo) => void removeProject(repo)}
        onRefreshGit={() => void refreshGit(activeProject)}
        onStart={() => void startReview()}
        onPreview={() => void previewReview()}
        latestSession={latestSession}
        onOpenHistory={() => goToPage('history')}
      />

      <main className="workspace">
        <TopBar
          page={page}
          project={activeProject}
          gitStatus={gitStatus}
          loading={gitLoading}
          onRefresh={() => void refreshGit(activeProject)}
          hasProvider={hasProvider}
          onOpenSettings={() => setPage('settings')}
        />

        <div className="workspace__body" ref={bodyRef}>
          {page === 'review' ? (
            activeProject ? (
              <ReviewPage
                repo={activeProject}
                gitStatus={gitStatus}
                form={form}
                run={run}
                preview={preview}
                onClosePreview={() => setPreview((p) => ({ ...p, open: false }))}
                onCancel={() => void cancelReview()}
                onStart={() => void startReview()}
                onOpenHistory={() => goToPage('history')}
                latestSession={latestSession}
                onOpenSettings={() => setPage('settings')}
                hasProvider={hasProvider}
              />
            ) : (
              <EmptyState
                icon={<FolderGit2 size={26} />}
                title="打开一个 Git 仓库开始"
                text="审查工作区更改、分支差异、单次提交，或扫描整个代码库。所有结果都会保存在本机会话目录中。"
                action={
                  <Button variant="primary" onClick={() => void openProject()}>
                    打开本地仓库
                  </Button>
                }
              />
            )
          ) : null}

          {page === 'history' ? (
            <HistoryPage
              repo={activeProject}
              resetKey={historyReset}
              onToast={(text, tone) => toast.push(text, tone)}
              onReuse={reuseSession}
              onOpenProject={() => void openProject()}
            />
          ) : null}

          {page === 'settings' ? (
            <SettingsPage
              env={env}
              config={config}
              providers={providers}
              settings={settings}
              onConfigSaved={setConfig}
              onSettingsSaved={(next) => {
                setSettings(next)
                setForm((current) => ({
                  ...current,
                  concurrency: next.defaultConcurrency,
                  effort: next.defaultEffort as FormState['effort']
                }))
              }}
              onRefreshEnv={async () => {
                const next = await window.ocr.env.check(true)
                setEnv(next)
                return next
              }}
              onOpenSetup={() => setShowSetup(true)}
              onToast={(text, tone) => toast.push(text, tone)}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}
