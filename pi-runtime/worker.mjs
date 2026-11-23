import { join } from 'node:path'
import { applySavedContextWindow, createContextWindowExtension } from './context-window.mjs'
import { resumeExtension } from './resume.mjs'
import { nameNewSession } from './title.mjs'
import { runAccounts } from './accounts.mjs'
import { parseArgs } from 'node:util'
/*
 * 从 **bundle 入口** 取 SDK，而不是包根的那个 barrel。
 *
 * 包根的 dist/index.js 是 157 个 re-export 的桶文件，它会把 249 个模块、
 * 2.5MB 源码一次性交给 V8 编译（CPU profile 里 compileSourceTextModule 独占
 * 95ms，加上 realpath/包作用域解析，整段约 380ms）。其中一多半是 CLI 与
 * TUI 才用得上的东西，RPC 模式根本不碰。
 *
 * dist/bundle/index.js 是 pi 官方预先打包好的版本，同样是 157 个导出，
 * 但模块图压到几十个 chunk，实测 173ms；再补三个 bundle 没导出的内部工具
 * （output-guard / http-dispatcher / project-trust），整段约 285ms。
 *
 * 这是 worker 冷启动最大的一笔开销，直接决定「切会话要等多久」。
 */
const sdk = import.meta.resolve('@earendil-works/pi-coding-agent')
const bundle = new URL('./bundle/index.js', sdk)
const {
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
} = await import(bundle)
const { takeOverStdout, writeRawStdout } = await import(new URL('./core/output-guard.js', sdk))
/*
 * 只取真正用得上的三个内置扩展，不走 extensions/index.js。
 *
 * 那个 index 会静态导入 llama 扩展，而 llama 的 ui.js 又拉进 pi-tui 与
 * modes/interactive（约 3.9MB 的 TUI 层）——RPC 模式一行 TUI 都不画，
 * 却要为它付 180ms 的模块解析时间。这里按需并行取三个，实测省下这部分。
 */
const builtInExtensions = await Promise.all(
  ['codemode', 'mcp', 'tool-search'].map(async (name) => ({
    name,
    factory: (await import(new URL(`./extensions/${name}/index.js`, sdk))).default,
    replaceable: true,
    builtin: true,
  })),
)
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
  installModelRefresh(runtime)
  await runRpcMode(runtime)
}


/**
 * 给 RPC 加一条自定义命令 `refresh_models`。
 *
 * 为什么需要：用户在设置里改了 models.json，回到会话时得看到新模型。
 * 原来的做法是重连——**杀掉整个 worker 再冷启一个**，500ms 起步，
 * 期间会话里显示「Pi 会话未就绪」。
 *
 * 但模型列表本来就只在 ModelRuntime 内存里，pi 的 get_available_models 读的就是
 * 它。调一次 refresh() 重新读盘即可，进程不用动。
 *
 * 实现上不碰 pi 的 runRpcMode（它把 handleCommand 收在闭包里，宿主拿不到），
 * 而是在 stdin 上先挂一个监听：识别到 refresh_models 就自己应答并吞掉这一行，
 * 其余原样放行给 pi 的解析器。stdin 是流，多一个监听者不影响原有消费。
 */
function installModelRefresh(runtime) {
  // pi 的 runRpcMode 会调 takeOverStdout，把普通 stdout 重定向到 stderr；
  // 我们抢在它之前接管，才能保证应答走真正的 stdout 通道。
  takeOverStdout()
  let buffer = ''
  process.stdin.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      let command
      try {
        command = JSON.parse(line)
      } catch {
        continue
      }
      if (command?.type !== 'refresh_models') continue
      void respondModelRefresh(runtime, command)
    }
  })
}

async function respondModelRefresh(runtime, command) {
  const reply = (body) =>
    writeRawStdout(
      JSON.stringify({ id: command.id, type: 'response', command: 'refresh_models', ...body }) + '\n',
    )
  try {
    await runtime.services.modelRuntime.refresh({ allowNetwork: false })
    reply({ success: true, data: { models: runtime.services.modelRuntime.getAvailableSnapshot() } })
  } catch (error) {
    reply({ success: false, error: error instanceof Error ? error.message : String(error) })
  }
}
