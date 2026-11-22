import { join } from 'node:path'
import { applySavedContextWindow, createContextWindowExtension } from './context-window.mjs'
import { resumeExtension } from './resume.mjs'
import { nameNewSession } from './title.mjs'
import { runAccounts } from './accounts.mjs'
import { parseArgs } from 'node:util'
import {
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  hasTrustRequiringProjectResources,
  ProjectTrustStore,
  ModelRuntime,
  runRpcMode,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent'

// These helpers are shared with Pi's host. The bundled SDK version is locked.
const sdk = import.meta.resolve('@earendil-works/pi-coding-agent')
const { writeRawStdout } = await import(new URL('./core/output-guard.js', sdk))
const { builtInExtensions } = await import(new URL('./extensions/index.js', sdk))
const { applyHttpProxySettings, configureHttpDispatcher } = await import(new URL('./core/http-dispatcher.js', sdk))
const { resolveProjectTrusted } = await import(new URL('./core/project-trust.js', sdk))

/**
 * 「每次询问」需要一个真的能问出口的上下文。
 *
 * pi 自带的 createProjectTrustContext 只认 mode === 'interactive'，而那个模式会
 * 直接在 stdout 上画 TUI 选择框——RPC 模式下 stdout 是 JSON 行协议，画一笔就把
 * 整条流污染了。所以这里自己造一个：询问走 RPC 自己的 extension_ui_request，
 * 界面收到后弹选择卡片，用户选完再用同 id 的 extension_ui_response 回传。
 *
 * 不这么做的话，ask 档拿不到 UI 就直接返回 false，与 never 完全等价——界面上
 * 选「每次询问」看起来毫无效果，项目本地配置永远不加载。
 */
function createRpcTrustContext(projectCwd) {
  return {
    cwd: projectCwd,
    mode: 'rpc',
    hasUI: true,
    ui: {
      select: (title, options) => askOverRpc(title, options),
      // 信任询问只需要单选；其余方法 pi 不会在这个上下文里调用
      confirm: async () => false,
      input: async () => undefined,
      notify: (message) => {
        if (message) process.stderr.write(`${message}\n`)
      },
    },
  }
}

let trustRequestSeq = 0

/**
 * 往 stdout 写一条 extension_ui_request，等宿主用 extension_ui_response 回话。
 *
 * 复用 pi 自己的 UI 子协议而不是新造一套：宿主那边已经有处理它的代码路径，
 * 加个新消息类型等于要两边同时改，还得处理旧宿主不认识的情况。
 */
async function askOverRpc(title, options) {
  const id = `trust-${++trustRequestSeq}`
  writeRawStdout(
    JSON.stringify({ type: 'extension_ui_request', id, method: 'select', title, options }) + '\n',
  )
  /*
   * 直接在 stdin 上读一行等回话，而不是挂监听器。
   *
   * 信任判定发生在 runRpcMode 接管 stdin 之前（它是会话启动流程的一部分），
   * 这时 stdin 还没有别的读者，独占读一行是安全的。反之若挂 data 监听器，
   * 流的 resume 会与 runRpcMode 自己的读取逻辑打架——实测会让它提前返回，
   * 顶层 await 悬空、Node 以退出码 13 结束进程，界面表现为会话一启动就断。
   */
  return await new Promise((resolve) => {
    let buffer = ''
    const onData = (chunk) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        let parsed
        try {
          parsed = JSON.parse(line)
        } catch {
          newline = buffer.indexOf('\n')
          continue
        }
        if (parsed?.type === 'extension_ui_response' && parsed.id === id) {
          process.stdin.off('data', onData)
          resolve(parsed.cancelled ? undefined : (parsed.value ?? parsed.confirmed))
          return
        }
        newline = buffer.indexOf('\n')
      }
    }
    process.stdin.on('data', onData)
  })
}

const { values } = parseArgs({
  options: {
    accounts: { type: 'boolean' },
    provider: { type: 'string' },
    model: { type: 'string' },
    session: { type: 'string' },
    'no-session': { type: 'boolean' },
    extension: { type: 'string' },
    'auto-title': { type: 'boolean' },
    /*
     * 宿主传来的项目信任档位，覆盖 settings.json 里的 defaultProjectTrust。
     *
     * 为什么要从命令行传：pi 只在进程启动时读一次 settings.json，用户中途在
     * 界面上改档位，已经在跑的这个进程不会重读（实证过：改成 always 再切会话，
     * 项目扩展依旧不加载）。宿主在启动新进程时把当前档位带上，就不必指望重读。
     */
    'project-trust': { type: 'string' },
  },
})

const cwd = process.cwd()
const agentDir = getAgentDir()

/** 宿主指定的档位；没传或不认识就退回 settings.json 的值 */
const trustOverride = ['ask', 'always', 'never'].includes(values['project-trust'])
  ? values['project-trust']
  : undefined
const trustStore = new ProjectTrustStore(agentDir)
const trustByCwd = new Map()
const bootstrapSettings = SettingsManager.create(cwd, agentDir, { projectTrusted: false })
applyHttpProxySettings(bootstrapSettings.getGlobalSettings().httpProxy)
configureHttpDispatcher(bootstrapSettings.getHttpIdleTimeoutMs())

if (values.accounts) {
  const models = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    signal: AbortSignal.timeout(15_000),
  })
  await runAccounts(models, bootstrapSettings)
} else {
  await runSession()
}

async function runSession() {
  const sessionManager = values['no-session']
    ? SessionManager.inMemory(cwd)
    : values.session ? SessionManager.open(values.session) : SessionManager.create(cwd)

  const runtime = await createAgentSessionRuntime(async (input) => {
    const { cwd, sessionManager, sessionStartEvent, projectTrustContext } = input
    const hasProjectResources = hasTrustRequiringProjectResources(cwd)
    const rememberedTrust = trustByCwd.get(cwd)
    const settingsManager = SettingsManager.create(cwd, agentDir, {
      projectTrusted: rememberedTrust ?? (!hasProjectResources && (trustStore.get(cwd) ?? true)),
    })
    const diagnostics = []
    let currentSession = null
    const contextWindowExtension = createContextWindowExtension({
      getSession: () => currentSession,
      settingsManager,
    })
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      settingsManager,
      modelRuntimeSignal: AbortSignal.timeout(15_000),
      resourceLoaderOptions: {
        packageCommandOutput: 'capture',
        extensionFactories: [
          ...builtInExtensions,
          contextWindowExtension,
          ...(values['auto-title'] ? [resumeExtension] : []),
        ],
        additionalExtensionPaths: values.extension ? [values.extension] : [],
      },
      resourceLoaderReloadOptions: hasProjectResources && rememberedTrust === undefined ? {
        resolveProjectTrust: async ({ extensionsResult }) => {
          const trusted = await resolveProjectTrusted({
            cwd,
            trustStore,
            defaultProjectTrust: trustOverride ?? bootstrapSettings.getDefaultProjectTrust(),
            extensionsResult,
            projectTrustContext: projectTrustContext ?? createRpcTrustContext(cwd),
            onExtensionError: (message) => diagnostics.push({ type: 'warning', message }),
          })
          trustByCwd.set(cwd, trusted)
          return trusted
        },
      } : undefined,
    })
    const { modelRuntime, resourceLoader } = services
    const model = values.model
      ? values.provider
        ? modelRuntime.getModel(values.provider, values.model)
        : modelRuntime.getModels().find((model) => model.id === values.model)
      : undefined
    const created = await createAgentSessionFromServices({
      services, sessionManager, sessionStartEvent, model,
    })
    currentSession = created.session
    applySavedContextWindow(created.session, settingsManager)
    if (values['auto-title']) {
      nameNewSession(created.session, modelRuntime, () => runtime.session === created.session, (pending) => {
        writeRawStdout(JSON.stringify({ type: 'piazza_title_pending', pending }) + '\n')
      })
    }
    for (const { path, error } of resourceLoader.getExtensions().errors) {
      diagnostics.push({ type: 'error', message: `扩展加载失败 (${path}): ${error}` })
    }
    return { ...created, services, diagnostics: [...services.diagnostics, ...diagnostics] }
  }, { cwd: sessionManager.getCwd(), agentDir, sessionManager })

  for (const { message } of runtime.takeUnreportedDiagnostics()) console.error(message)
  await runRpcMode(runtime)
}
