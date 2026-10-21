import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  PlugZap,
  RefreshCw,
  Save,
  Terminal,
  TriangleAlert,
  Wrench
} from 'lucide-react'
import type {
  AppInfo,
  AppSettings,
  EnvCheck,
  OcrConfigView,
  ProviderInfo,
  SaveProviderRequest,
  TestConnectionResult
} from '@shared/types'
import { Button, Chip, Field, Segmented, Spinner } from './ui'

type Toast = (text: string, tone?: 'info' | 'success' | 'error') => void

function EnvironmentRow({
  label,
  value,
  ok
}: {
  label: string
  value: string
  ok: boolean
}): React.JSX.Element {
  return (
    <div className="env-row">
      <span className={`env-row__dot ${ok ? 'is-ok' : 'is-missing'}`} />
      <span className="env-row__name">{label}</span>
      <span className="env-row__version" title={value}>
        {value}
      </span>
      {ok ? <CheckCircle2 size={14} className="env-row__check" /> : <TriangleAlert size={14} className="env-row__alert" />}
    </div>
  )
}

export default function SettingsPage({
  env,
  config,
  providers,
  settings,
  onConfigSaved,
  onSettingsSaved,
  onRefreshEnv,
  onOpenSetup,
  onToast
}: {
  env: EnvCheck | null
  config: OcrConfigView | null
  providers: ProviderInfo[]
  settings: AppSettings | null
  onConfigSaved: (config: OcrConfigView) => void
  onSettingsSaved: (settings: AppSettings) => void
  onRefreshEnv: () => Promise<EnvCheck>
  onOpenSetup: () => void
  onToast: Toast
}): React.JSX.Element {
  const [custom, setCustom] = useState(false)
  const [providerName, setProviderName] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [protocol, setProtocol] = useState('openai')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)

  const [language, setLanguage] = useState('English')
  const [effort, setEffort] = useState('')
  const [maxTokens, setMaxTokens] = useState(0)
  const [concurrency, setConcurrency] = useState(8)
  const [autoRefreshGit, setAutoRefreshGit] = useState(true)
  const [prefsSaving, setPrefsSaving] = useState(false)

  const [cliPath, setCliPath] = useState('')
  const [editorCommand, setEditorCommand] = useState('auto')
  const [cliSaving, setCliSaving] = useState(false)
  const [rechecking, setRechecking] = useState(false)

  const [info, setInfo] = useState<AppInfo | null>(null)
  const [customNames, setCustomNames] = useState<string[]>([])
  const [renameTo, setRenameTo] = useState('')
  const [fixing, setFixing] = useState(false)

  useEffect(() => {
    setLanguage(config?.language || 'English')
    setEffort(config?.effort || '')
    setMaxTokens(config?.maxTokens || 0)
  }, [config])

  useEffect(() => {
    setConcurrency(settings?.defaultConcurrency ?? 8)
    setAutoRefreshGit(settings?.autoRefreshGit ?? true)
    setCliPath(settings?.cliPath ?? '')
    setEditorCommand(settings?.editorCommand ?? 'auto')
  }, [settings])

  useEffect(() => {
    void window.ocr.app.info().then(setInfo).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!config) return
    const names = Object.keys(config.customProviders)
    setCustomNames(names)

    const active = config.provider
    const activeIsBuiltIn = providers.some((provider) => provider.name === active)
    if (active && !activeIsBuiltIn && names.includes(active)) {
      setCustom(true)
      setProviderName(active)
      setModel(config.model)
      setBaseURL(config.customProviders[active]?.base_url ?? '')
      setProtocol(config.customProviders[active]?.protocol ?? 'openai')
      return
    }
    setCustom(false)
    const builtIn = providers.find((p) => p.name === active) ?? providers[0]
    setProviderName(builtIn?.name ?? '')
    setModel(config.model || builtIn?.models[0] || '')
    setBaseURL(builtIn?.baseURL ?? '')
    setProtocol(builtIn?.protocol ?? '')
  }, [config, providers])

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.name === providerName),
    [providers, providerName]
  )
  const collisionName =
    !custom && providerName && config?.customProviders?.[providerName] ? providerName : null

  useEffect(() => {
    if (collisionName) setRenameTo(`${collisionName}-custom`)
  }, [collisionName])
  const providerView = config?.providers[providerName]
  const customView = config?.customProviders[providerName]
  const hasSavedKey =
    (custom ? customView?.api_key_set : providerView?.api_key_set) ?? false
  const savedKeyMask = custom ? customView?.api_key : providerView?.api_key
  const isBedrock = !custom && selectedProvider?.name === 'bedrock'
  const isExternalAuth = !custom && selectedProvider?.externalAuth

  const activeSummary = useMemo(() => {
    if (!config?.provider) return null
    const builtIn = providers.some((provider) => provider.name === config.provider)
    return {
      provider: config.provider,
      model: config.model || '—',
      key:
        (builtIn
          ? config.providers[config.provider]?.api_key
          : config.customProviders[config.provider]?.api_key) ||
        (config.provider === 'bedrock' ? '环境凭证' : null)
    }
  }, [config, providers])

  function buildDraft(): SaveProviderRequest {
    return {
      provider: providerName.trim(),
      model: model.trim(),
      apiKey: apiKey.trim() || undefined,
      custom,
      baseURL: custom ? baseURL.trim() : undefined,
      protocol: custom ? protocol : undefined
    }
  }

  function validateDraft(): string | null {
    if (!providerName.trim()) return custom ? '请填写自定义服务商名称' : '请选择服务商'
    if (!model.trim()) return '请填写模型名称'
    if (custom && !baseURL.trim()) return '请填写自定义服务商的接口地址'
    if (custom && providers.some((provider) => provider.name === providerName.trim())) {
      return `“${providerName.trim()}” 是内置服务商名称，自定义配置不会生效。请换一个名称，例如 ${providerName.trim()}-custom。`
    }
    return null
  }

  async function renameCollision(): Promise<void> {
    if (!collisionName) return
    setFixing(true)
    try {
      const next = await window.ocr.config.renameCustomProvider(collisionName, renameTo)
      onConfigSaved(next)
      onToast(`已重命名为 ${renameTo}`, 'success')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setFixing(false)
    }
  }

  async function migrateCollision(): Promise<void> {
    if (!collisionName) return
    setFixing(true)
    try {
      const next = await window.ocr.config.migrateCustomProvider(collisionName)
      onConfigSaved(next)
      onToast(`已将密钥迁移到内置服务商 ${collisionName}`, 'success')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setFixing(false)
    }
  }

  async function saveProvider(): Promise<void> {
    const problem = validateDraft()
    if (problem) {
      onToast(problem, 'error')
      return
    }
    setSaving(true)
    try {
      const next = await window.ocr.config.saveProvider(buildDraft())
      onConfigSaved(next)
      setApiKey('')
      onToast('模型配置已保存', 'success')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function testDraft(): Promise<void> {
    const problem = validateDraft()
    if (problem) {
      onToast(problem, 'error')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.ocr.config.testConnection({ draft: buildDraft() })
      setTestResult(result)
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setTesting(false)
    }
  }

  async function testSaved(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.ocr.config.testConnection()
      setTestResult(result)
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setTesting(false)
    }
  }

  async function savePreferences(): Promise<void> {
    setPrefsSaving(true)
    try {
      const nextConfig = await window.ocr.config.savePreferences({
        language,
        effort,
        maxTokens
      })
      const nextSettings = await window.ocr.settings.save({
        defaultConcurrency: concurrency,
        defaultEffort: effort as AppSettings['defaultEffort'],
        autoRefreshGit
      })
      onConfigSaved(nextConfig)
      onSettingsSaved(nextSettings)
      onToast('审查偏好已保存', 'success')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setPrefsSaving(false)
    }
  }

  async function saveCli(): Promise<void> {
    setCliSaving(true)
    try {
      const next = await window.ocr.settings.save({ cliPath: cliPath.trim(), editorCommand })
      onSettingsSaved(next)
      const nextEnv = await onRefreshEnv()
      if (nextEnv.ocr.ok) onToast('命令行设置已保存', 'success')
      else onToast('设置已保存，但没有找到 ocr 命令', 'error')
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setCliSaving(false)
    }
  }

  async function recheck(): Promise<void> {
    setRechecking(true)
    try {
      const nextEnv = await onRefreshEnv()
      onToast(nextEnv.ocr.ok ? '环境检查通过' : '仍未找到 ocr 命令', nextEnv.ocr.ok ? 'success' : 'error')
    } finally {
      setRechecking(false)
    }
  }

  const keyPlaceholder = isBedrock
    ? '使用 AWS 凭证链，无需 API Key'
    : isExternalAuth
      ? '该服务商需要单独登录'
      : hasSavedKey
        ? `已保存 ${savedKeyMask}，留空保持不变`
        : selectedProvider?.envVar
          ? `留空则读取环境变量 ${selectedProvider.envVar}`
          : '粘贴 API Key'

  return (
    <div className="settings-page">
      <header className="page-head">
        <div className="page-head__copy">
          <div className="page-head__meta">
            <Chip tone={env?.ocr.ok ? 'green' : 'red'}>{env?.ocr.ok ? '命令行已就绪' : '命令行缺失'}</Chip>
            <span className="mono">{env?.ocr.version ?? 'ocr 未安装'}</span>
          </div>
          <h2>设置</h2>
          <p>模型服务写入 <code>~/.opencodereview/config.json</code>，审查偏好同时用于桌面端的默认值。</p>
        </div>
        <div className="page-head__actions">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} className={rechecking ? 'spin' : ''} />} loading={rechecking} onClick={() => void recheck()}>
            重新检测
          </Button>
        </div>
      </header>

      <section className="settings-section">
        <div className="settings-section__side">
          <h3>模型服务</h3>
          <p>OpenCodeReview 通过 OpenAI / Anthropic 兼容接口调用模型。内置服务商也可以只依赖环境变量。</p>
        </div>

        <div className="settings-section__body">
          {activeSummary ? (
            <div className="active-provider">
              <div>
                <span className="active-provider__label">当前生效</span>
                <strong>
                  {activeSummary.provider} · {activeSummary.model}
                </strong>
              </div>
              <div className="active-provider__actions">
                <Chip tone={activeSummary.key ? 'green' : 'amber'}>
                  {activeSummary.key ? '密钥已配置' : '未检测到密钥'}
                </Chip>
                <Button
                  variant="quiet"
                  size="sm"
                  icon={<PlugZap size={14} />}
                  loading={testing}
                  onClick={() => void testSaved()}
                >
                  测试当前配置
                </Button>
              </div>
            </div>
          ) : (
            <div className="notice-bar notice-bar--static notice-bar--amber">
              <TriangleAlert size={16} />
              <span>还没有配置模型服务。选择服务商、填写密钥并保存后即可开始审查。</span>
            </div>
          )}

          {collisionName ? (
            <div className="conflict-card">
              <TriangleAlert size={16} />
              <div className="conflict-card__body">
                <strong>“{collisionName}” 与内置服务商重名</strong>
                <p>
                  同名的自定义配置不会生效，ocr 会读取内置服务商的配置。
                  可以重命名这条自定义配置，或把其中的密钥迁移到内置服务商。
                </p>
                <div className="conflict-card__actions">
                  <input
                    value={renameTo}
                    onChange={(event) => setRenameTo(event.target.value)}
                    aria-label="新的自定义服务商名称"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={fixing}
                    onClick={() => void renameCollision()}
                  >
                    重命名
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={fixing}
                    onClick={() => void migrateCollision()}
                  >
                    迁移密钥到内置
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <Segmented
            value={custom ? 'custom' : 'builtin'}
            onChange={(value) => {
              const nextCustom = value === 'custom'
              setCustom(nextCustom)
              setTestResult(null)
              if (nextCustom) {
                setProviderName('')
                setModel('')
                setBaseURL('')
                setProtocol('openai')
              } else {
                const first = providers[0]
                setProviderName(first?.name ?? '')
                setModel(first?.models[0] ?? '')
                setBaseURL(first?.baseURL ?? '')
                setProtocol(first?.protocol ?? '')
              }
            }}
            options={[
              { value: 'builtin', label: '内置服务商' },
              { value: 'custom', label: '自定义服务商' }
            ]}
            ariaLabel="服务商类型"
          />

          {custom ? (
            <>
              {customNames.length > 0 ? (
                <Field label="已保存的自定义服务商">
                  <select
                    value={customNames.includes(providerName) ? providerName : ''}
                    onChange={(event) => {
                      const name = event.target.value
                      setProviderName(name)
                      if (!name) {
                        setModel('')
                        setBaseURL('')
                        setProtocol('openai')
                        return
                      }
                      setBaseURL(config?.customProviders[name]?.base_url ?? '')
                      setProtocol(config?.customProviders[name]?.protocol ?? 'openai')
                      setModel(config?.provider === name ? config.model : '')
                    }}
                  >
                    <option value="">新建自定义服务商</option>
                    {customNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              <Field label="名称" hint="用于配置文件和命令行中的服务商标识。">
                <input value={providerName} placeholder="my-gateway" onChange={(event) => setProviderName(event.target.value)} />
              </Field>
              <Field label="接口地址" hint="兼容 OpenAI Chat Completions 或 Anthropic Messages 的完整 Base URL。">
                <input
                  value={baseURL}
                  placeholder="https://gateway.example.com/v1"
                  onChange={(event) => setBaseURL(event.target.value)}
                />
              </Field>
              <Field label="协议">
                <select value={protocol} onChange={(event) => setProtocol(event.target.value)}>
                  <option value="openai">OpenAI Chat Completions</option>
                  <option value="anthropic">Anthropic Messages</option>
                  <option value="openai-responses">OpenAI Responses</option>
                </select>
              </Field>
            </>
          ) : (
            <Field label="服务商" hint={selectedProvider?.baseURL ? `默认地址：${selectedProvider.baseURL}` : undefined}>
              <select
                value={providerName}
                onChange={(event) => {
                  const name = event.target.value
                  const provider = providers.find((item) => item.name === name)
                  setProviderName(name)
                  setModel(provider?.models[0] ?? '')
                  setBaseURL(provider?.baseURL ?? '')
                  setProtocol(provider?.protocol ?? '')
                  setTestResult(null)
                }}
              >
                <option value="">请选择服务商</option>
                {providers.map((provider) => (
                  <option key={provider.name} value={provider.name}>
                    {provider.name} — {provider.displayName}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label="模型"
            hint={
              !custom && selectedProvider?.models.length
                ? '可以直接输入其他模型 ID。'
                : undefined
            }
          >
            <input
              list={custom ? undefined : 'ocr-model-options'}
              value={model}
              placeholder={custom ? 'model-id' : selectedProvider?.models[0] ?? 'model-id'}
              onChange={(event) => setModel(event.target.value)}
            />
            {!custom ? (
              <datalist id="ocr-model-options">
                {(selectedProvider?.models ?? []).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            ) : null}
          </Field>

          {isBedrock ? (
            <p className="field-note">
              AWS Bedrock 使用环境中的 AWS 凭证链（<code>AWS_REGION</code> / <code>AWS_PROFILE</code>），无需填写 API Key。
            </p>
          ) : isExternalAuth ? (
            <p className="field-note">
              该服务商需要在终端完成登录。桌面端暂不代理登录流程，登录后可回到这里测试连接。
            </p>
          ) : (
            <Field label="API Key" hint={hasSavedKey ? '出于安全考虑，已保存的密钥不会回填到输入框。' : undefined}>
              <input
                type="password"
                value={apiKey}
                placeholder={keyPlaceholder}
                autoComplete="off"
                onChange={(event) => setApiKey(event.target.value)}
              />
            </Field>
          )}

          <div className="settings-actions">
            <Button variant="primary" icon={<Save size={15} />} loading={saving} onClick={() => void saveProvider()}>
              保存模型配置
            </Button>
            <Button
              variant="secondary"
              icon={<PlugZap size={15} />}
              loading={testing}
              onClick={() => void testDraft()}
            >
              测试填写的连接
            </Button>
          </div>

          {testResult ? (
            <div className={`test-result ${testResult.ok ? 'is-ok' : 'is-bad'}`}>
              {testResult.ok ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
              <div>
                <strong>{testResult.ok ? '连接成功' : '连接失败'}</strong>
                <p>{testResult.message}</p>
                {testResult.output ? (
                  <details>
                    <summary>查看详细输出</summary>
                    <pre>{testResult.output}</pre>
                  </details>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__side">
          <h3>审查偏好</h3>
          <p>作为新审查的默认值。单次审查仍可在左侧高级选项中覆盖。</p>
        </div>
        <div className="settings-section__body">
          <div className="field-row">
            <Field label="报告语言" hint="直接写入模型指令，例如 Chinese、English、日本語。">
              <input
                list="ocr-language-options"
                value={language}
                placeholder="English"
                onChange={(event) => setLanguage(event.target.value)}
              />
              <datalist id="ocr-language-options">
                <option value="Chinese" />
                <option value="English" />
                <option value="Japanese" />
              </datalist>
            </Field>
            <Field label="默认审查力度">
              <select value={effort} onChange={(event) => setEffort(event.target.value)}>
                <option value="">跟随内置默认</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </Field>
          </div>
          <div className="field-row">
            <Field label="默认并发数" hint="1–32，较大的值更快，但会给模型服务更多压力。">
              <input
                type="number"
                min={1}
                max={32}
                value={concurrency}
                onChange={(event) => setConcurrency(Number(event.target.value) || 1)}
              />
            </Field>
            <Field label="单组 Token 上限" hint="0 表示使用内置模板默认值。">
              <input
                type="number"
                min={0}
                step={1000}
                value={maxTokens || ''}
                placeholder="默认"
                onChange={(event) => setMaxTokens(Number(event.target.value) || 0)}
              />
            </Field>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={autoRefreshGit}
              onChange={(event) => setAutoRefreshGit(event.target.checked)}
            />
            <span>
              切换项目时自动刷新 Git 状态
              <small>关闭后可手动点击顶部的刷新按钮。</small>
            </span>
          </label>
          <div className="settings-actions">
            <Button variant="primary" icon={<Save size={15} />} loading={prefsSaving} onClick={() => void savePreferences()}>
              保存偏好
            </Button>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__side">
          <h3>命令行与编辑器</h3>
          <p>桌面端通过本机 <code>ocr</code> 命令执行审查。找不到命令时，可以显式指定路径。</p>
        </div>
        <div className="settings-section__body">
          <div className="env-list">
            <EnvironmentRow label="ocr" value={env?.ocr.version ?? '未安装'} ok={Boolean(env?.ocr.ok)} />
            <EnvironmentRow label="git" value={env?.git.version ?? '未找到'} ok={Boolean(env?.git.ok)} />
            <EnvironmentRow label="node" value={env?.node.version ?? '未找到'} ok={Boolean(env?.node.ok)} />
            <EnvironmentRow label="npm" value={env?.npm.version ?? '未找到'} ok={Boolean(env?.npm.ok)} />
          </div>

          <Field
            label="ocr 命令路径"
            hint={env?.ocr.path ? `当前解析到：${env.ocr.path}` : '留空时自动在 PATH 与 npm 全局目录中查找。'}
          >
            <input
              value={cliPath}
              placeholder="自动检测"
              onChange={(event) => setCliPath(event.target.value)}
            />
          </Field>

          <Field label="打开文件时使用的编辑器">
            <select value={editorCommand} onChange={(event) => setEditorCommand(event.target.value)}>
              <option value="auto">自动检测（code / cursor / idea）</option>
              <option value="code">VS Code</option>
              <option value="cursor">Cursor</option>
              <option value="windsurf">Windsurf</option>
              <option value="idea">IntelliJ IDEA</option>
              <option value="webstorm">WebStorm</option>
              <option value="subl">Sublime Text</option>
            </select>
          </Field>

          <div className="settings-actions">
            <Button variant="primary" icon={<Save size={15} />} loading={cliSaving} onClick={() => void saveCli()}>
              保存命令行设置
            </Button>
            <Button variant="secondary" icon={<Terminal size={15} />} onClick={onOpenSetup}>
              安装 / 更新 ocr
            </Button>
            <Button variant="quiet" icon={<FolderOpen size={15} />} onClick={() => void window.ocr.app.openConfigFolder()}>
              配置目录
            </Button>
            <Button variant="quiet" icon={<FolderOpen size={15} />} onClick={() => void window.ocr.app.openSessionsFolder()}>
              会话目录
            </Button>
          </div>

          <div className="path-card">
            <span>配置文件</span>
            <code title={config?.path}>{config?.path || env?.ocrConfigPath || '—'}</code>
            {config?.exists ? (
              <Button
                variant="quiet"
                size="sm"
                icon={<ExternalLink size={13} />}
                onClick={() => void window.ocr.shell.openPath(config.path)}
              >
                打开 JSON
              </Button>
            ) : (
              <span className="path-card__empty">尚未创建</span>
            )}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__side">
          <h3>关于</h3>
          <p>桌面端是 OpenCodeReview 命令行的图形界面，本项目遵循 Apache-2.0 许可。</p>
        </div>
        <div className="settings-section__body">
          {info ? (
            <div className="about-grid">
              <div>
                <span>桌面端</span>
                <strong>v{info.version}</strong>
              </div>
              <div>
                <span>Electron</span>
                <strong>{info.electron}</strong>
              </div>
              <div>
                <span>Chromium</span>
                <strong>{info.chrome}</strong>
              </div>
              <div>
                <span>Node</span>
                <strong>{info.node}</strong>
              </div>
            </div>
          ) : (
            <Spinner label="读取版本信息…" />
          )}

          <div className="about-links">
            <button onClick={() => void window.ocr.shell.openExternal('https://github.com/alibaba/open-code-review')}>
              <ExternalLink size={14} />
              GitHub 仓库
            </button>
            <button onClick={() => void window.ocr.shell.openExternal('https://open-codereview.ai/docs')}>
              <ExternalLink size={14} />
              使用文档
            </button>
            <button onClick={() => void window.ocr.shell.openExternal('https://open-codereview.ai')}>
              <ExternalLink size={14} />
              官方网站
            </button>
            <button onClick={() => void window.ocr.app.openSessionsFolder()}>
              <Wrench size={14} />
              本机会话目录
            </button>
          </div>

          <p className="about-note">
            桌面端只负责编排与呈现；审查逻辑、规则匹配与会话格式均来自 OpenCodeReview 命令行。
          </p>
        </div>
      </section>
    </div>
  )
}
