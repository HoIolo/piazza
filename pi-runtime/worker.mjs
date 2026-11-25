import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { createComputerUseExtension } from './computer-use.mjs'
import { applySavedContextWindow, createContextWindowExtension } from './context-window.mjs'
import { createMemoryExtension } from './memory.mjs'
import { resumeExtension } from './resume.mjs'
import { nameNewSession } from './title.mjs'
import { runAccounts } from './accounts.mjs'
import { parseArgs } from 'node:util'

/*
 * 在任何模块改写 process.stdout.write 之前，先把真正的 stdout 写入函数留下来。
 *
 * 不能再从 ./core/output-guard.js 导入 takeOverStdout/writeRawStdout：
 * dist/bundle/index.js 内部打包了另一份 output-guard，两份模块的
 * stdoutTakeoverState 互不相通。若这里先调 core/output-guard.js 的 takeOverStdout()，
 * 它会把 process.stdout.write 重定向到 stderr；随后 runRpcMode 再调 bundle 里的
 * takeOverStdout() 时，就会把「已指向 stderr 的 write」当成原始 stdout 保存下来——
 * 导致所有 RPC 应答全部写进 stderr，宿主读 stdout 永远收不到帧，命令全部超时。
 *
 * 这里只保存原始写入引用、不覆写 process.stdout.write，把接管权留给 runRpcMode。
 */
const rawStdoutWrite = process.stdout.write.bind(process.stdout)
function writeRawStdout(text) {
  if (text) rawStdoutWrite(text)
}

/*
 * Node 22+ 默认把任何未捕获的 Promise rejection 视作致命错误并立刻 exit(1)。
 * 后台 MCP 子进程断开、代理/HTTP 长连接被对端重置（ECONNRESET）、或扩展异步回调抛错
 * 都可能触发未捕获异常；把它们记到 stderr 而不是直接杀掉整条会话进程，
 * 避免用户在对话中途突然看到「会话进程异常退出」。
 * 若宿主关掉了 stdout（EPIPE），说明宿主已放弃该进程，此时应安静退出。
 */
function formatFatalError(reason) {
  if (reason instanceof Error) return reason.stack || reason.message
  return String(reason)
}

process.stdout.on('error', (err) => {
  if (err?.code === 'EPIPE') process.exit(0)
})

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[piazza-worker] unhandledRejection: ${formatFatalError(reason)}\n`)
})

process.on('uncaughtException', (err) => {
  if (err?.code === 'EPIPE') process.exit(0)
  process.stderr.write(`[piazza-worker] uncaughtException: ${formatFatalError(err)}\n`)
})

/*
 * 从 **bundle 入口** 取 SDK，而不是包根的那个 barrel。
 *
 * 包根的 dist/index.js 是 157 个 re-export 的桶文件，它会把 249 个模块、
 * 2.5MB 源码一次性交给 V8 编译（CPU profile 里 compileSourceTextModule 独占
 * 95ms，加上 realpath/包作用域解析，整段约 380ms）。其中一多半是 CLI 与
 * TUI 才用得上的东西，RPC 模式根本不碰。
 *
 * dist/bundle/index.js 是 pi 官方预先打包好的版本，同样是 157 个导出，
 * 但模块图压到几十个 chunk，实测 173ms；再补两个 bundle 没导出的内部工具
 * （http-dispatcher / project-trust），整段约 285ms。
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
          // 切回暂停态，避免在 runRpcMode 挂上 reader 前把宿主的后续命令直接吞掉
          process.stdin.pause()
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
    ? createInMemorySession(cwd, values.session)
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
          createComputerUseExtension(),
          contextWindowExtension,
          createMemoryExtension({
            cwd,
            agentDir,
            settingsManager,
            getSessionId: () => currentSession?.sessionManager?.getSessionId?.() ?? null,
          }),
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
  installCustomCommands(runtime)
  await runRpcMode(runtime)
}

/** 必须用函数声明以便提升到顶层 `await runSession()` 之前，避免 ES 模块 TDZ */
function findCustomHandler(type) {
  switch (type) {
    case 'refresh_models':
      return respondModelRefresh
    case 'rewind_before':
      return respondRewindBefore
    case 'get_branch_fork_messages':
      return respondBranchForkMessages
    case 'seed_from_session':
      return respondSeedFromSession
    default:
      return undefined
  }
}

/** 只读提取源会话当前活跃分支的条目，供侧边聊天以纯内存方式继承主会话上下文 */
function loadBranchEntriesReadOnly(cwd, sourcePath) {
  if (!sourcePath || !existsSync(sourcePath)) return null
  try {
    const raw = readFileSync(sourcePath, 'utf8')
    if (!raw.trim()) return null
    const parsed = []
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        parsed.push(JSON.parse(trimmed))
      } catch {
        // 跳过损坏行
      }
    }
    const header = parsed.find((entry) => entry?.type === 'session')
    if (!header) return null
    const temp = SessionManager.inMemory(cwd, undefined, parsed)
    const branch = temp.getBranch()
    return branch.length > 0 ? [header, ...branch] : null
  } catch {
    return null
  }
}

function createInMemorySession(cwd, sourcePath) {
  const entries = loadBranchEntriesReadOnly(cwd, sourcePath)
  return entries ? SessionManager.inMemory(cwd, undefined, entries) : SessionManager.inMemory(cwd)
}

/**
 * 给 RPC 注入 Piazza 自有快速命令（refresh_models / rewind_before / get_branch_fork_messages）。
 *
 * - `refresh_models`：只刷新 ModelRuntime 内存缓存，不必杀进程冷启；
 * - `rewind_before`：原地用 `session.navigateTree` 在内存中回退会话树，保留当前选中模型与
 *   推理强度，避免 `truncate + switch_session` 触发整套 services/扩展/MCP 销毁重建（在
 *   Windows 上重连 MCP 与重扫文件可达数秒）；
 * - `get_branch_fork_messages`：只返回当前活跃分支上的用户消息，避免分支编辑后 fork 选到旧分支。
 *
 * 代理 process.stdin.on('data', ...) 截获自定义命令，其余行原样转发给 runRpcMode。
 */
function installCustomCommands(runtime) {
  const origOn = process.stdin.on.bind(process.stdin)
  const origOff = process.stdin.off.bind(process.stdin)
  const origRemove = process.stdin.removeListener.bind(process.stdin)
  const origPrepend = process.stdin.prependListener.bind(process.stdin)
  const wrappedListeners = new Map()

  process.stdin.on = (event, listener) => {
    if (event !== 'data') return origOn(event, listener)
    const decoder = new StringDecoder('utf8')
    let buffer = ''
    const forward = (line) => {
      if (
        line.includes('"refresh_models"') ||
        line.includes('"rewind_before"') ||
        line.includes('"get_branch_fork_messages"') ||
        line.includes('"seed_from_session"')
      ) {
        try {
          const command = JSON.parse(line)
          const handler = command?.type ? findCustomHandler(command.type) : undefined
          if (handler) {
            void handler(runtime, command)
            return
          }
        } catch {
          // 畸形 JSON 仍交给 pi 自己按协议报错
        }
      }
      listener(line + '\n')
    }
    const wrapped = (chunk) => {
      buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk)
      let nl = buffer.indexOf('\n')
      while (nl !== -1) {
        forward(buffer.slice(0, nl))
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
      }
    }
    const flushEnd = () => {
      buffer += decoder.end()
      if (buffer.length > 0) {
        const tail = buffer
        buffer = ''
        forward(tail)
      }
    }
    wrappedListeners.set(listener, { wrapped, flushEnd })
    origPrepend('end', flushEnd)
    return origOn('data', wrapped)
  }

  const unwrap = (orig) => (event, listener) => {
    if (event === 'data') {
      const entry = wrappedListeners.get(listener)
      if (entry) {
        wrappedListeners.delete(listener)
        origOff('end', entry.flushEnd)
        return orig('data', entry.wrapped)
      }
    }
    return orig(event, listener)
  }
  process.stdin.off = unwrap(origOff)
  process.stdin.removeListener = unwrap(origRemove)
}

function sendRpcReply(command, body) {
  writeRawStdout(
    JSON.stringify({ id: command.id, type: 'response', command: command.type, ...body }) + '\n',
  )
}

function extractEntryText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
}

function collectActiveUserEntries(sessionManager) {
  const projected = sessionManager.buildSessionProjection().entries
  const result = []
  for (const { sourceEntry } of projected) {
    if (sourceEntry?.type !== 'message' || sourceEntry.message?.role !== 'user') continue
    const parent = sourceEntry.parentId ? sessionManager.getEntry(sourceEntry.parentId) : undefined
    if (parent?.type === 'message' && parent.message?.role === 'toolResult') continue
    const text = extractEntryText(sourceEntry.message.content)
    if (text) result.push({ entryId: sourceEntry.id, text })
  }
  return result
}

function resolveActiveUserEntry(entries, userIndex, rawText) {
  const trimmed = typeof rawText === 'string' ? rawText.trim() : ''
  if (typeof userIndex === 'number' && entries[userIndex]?.text.trim() === trimmed) {
    return entries[userIndex]
  }
  if (trimmed) {
    const exact = entries.find((item) => item.text.trim() === trimmed)
    if (exact) return exact
  }
  return typeof userIndex === 'number' ? entries[userIndex] : undefined
}

async function respondModelRefresh(runtime, command) {
  try {
    await runtime.services.modelRuntime.refresh({ allowNetwork: false })
    sendRpcReply(command, {
      success: true,
      data: { models: runtime.services.modelRuntime.getAvailableSnapshot() },
    })
  } catch (error) {
    sendRpcReply(command, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function respondBranchForkMessages(runtime, command) {
  try {
    const messages = collectActiveUserEntries(runtime.session.sessionManager)
    sendRpcReply(command, { success: true, data: { messages } })
  } catch (error) {
    sendRpcReply(command, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function respondSeedFromSession(runtime, command) {
  try {
    const session = runtime.session
    const sm = session.sessionManager
    if (sm.isPersisted()) {
      sendRpcReply(command, { success: false, error: '仅支持对临时内存会话注入上下文' })
      return
    }
    const entries = loadBranchEntriesReadOnly(sm.getCwd(), command.sessionPath)
    if (entries) {
      sm._loadEntries(entries)
      session.refreshContext()
    }
    sendRpcReply(command, {
      success: true,
      data: { seeded: Boolean(entries), messageCount: session.messages.length },
    })
  } catch (error) {
    sendRpcReply(command, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function respondRewindBefore(runtime, command) {
  try {
    const session = runtime.session
    const sm = session.sessionManager
    const entries = collectActiveUserEntries(sm)
    const target = command.entryId
      ? entries.find((item) => item.entryId === command.entryId)
      : resolveActiveUserEntry(entries, command.userIndex, command.rawText)
    if (!target) {
      sendRpcReply(command, { success: false, error: '无法定位该条用户消息对应的会话节点' })
      return
    }
    const activeModel = session.model
    const activeThinking = session.thinkingLevel
    const nav = await session.navigateTree(target.entryId, { summarize: false })
    if (nav?.cancelled) {
      sendRpcReply(command, { success: true, data: { cancelled: true } })
      return
    }
    const projected = sm.buildSessionProjection()
    if (
      activeModel &&
      (!projected.model ||
        projected.model.provider !== activeModel.provider ||
        projected.model.id !== activeModel.id)
    ) {
      sm.appendModelChange(activeModel.provider, activeModel.id)
    }
    if (activeThinking && projected.thinkingLevel !== activeThinking) {
      sm.appendThinkingLevelChange(activeThinking)
    }
    sendRpcReply(command, {
      success: true,
      data: {
        cancelled: false,
        messages: session.messages,
        sessionFile: session.sessionFile ?? null,
      },
    })
  } catch (error) {
    sendRpcReply(command, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
