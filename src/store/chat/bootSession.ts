import { rpcClient, type ExitInfo } from '@/rpc/client'
import type { MessagesData, SessionState } from '@/rpc/types'
import type { ChatError } from './types'

interface SwitchResult {
  cancelled?: boolean
}

let launch = Promise.resolve()
let runningCwd: string | null = null

export function markRpcProcessExited(): void {
  runningCwd = null
}

const BOOT_TIMEOUT_MS = 20_000

export function startWatchdog(
  isCancelled: () => boolean,
  onTimeout: (err: ChatError) => void,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    if (isCancelled()) return
    onTimeout({
      message: '启动 pi 会话超时',
      detail: `等待 ${BOOT_TIMEOUT_MS / 1000} 秒仍未就绪。pi 可能没能启动，或启动后没有响应。`,
      fatal: true,
    })
  }, BOOT_TIMEOUT_MS)
}

export function describeExit({ code, stderr }: ExitInfo): ChatError {
  const detail = stderr.trim() || undefined
  if (code === null) {
    return { message: 'pi 进程被终止', detail: detail ?? '进程被信号杀死。', fatal: true }
  }
  if (code === 0) {
    return {
      message: 'pi 进程已退出',
      detail: detail ?? '进程以退出码 0 正常结束，通常意味着与它的连接被切断。',
      fatal: true,
    }
  }
  return { message: `pi 进程异常退出（退出码 ${code}）`, detail, fatal: true }
}

async function tryWarmSwitch(
  cwd: string,
  sessionPath: string | null,
  wasStreaming: boolean,
): Promise<boolean> {
  if (runningCwd !== cwd) return false
  try {
    if (wasStreaming) {
      await rpcClient.send({ type: 'abort' }).catch(() => undefined)
    }
    const res = sessionPath
      ? await rpcClient.send<SwitchResult>({ type: 'switch_session', sessionPath })
      : await rpcClient.send<SwitchResult>({ type: 'new_session' })
    return !res?.cancelled
  } catch {
    runningCwd = null
    return false
  }
}

async function coldStart(
  cwd: string,
  sessionPath: string | null,
  previous: SessionState | null,
): Promise<void> {
  runningCwd = null
  await rpcClient.start({
    cwd,
    sessionPath: sessionPath ?? undefined,
    ...(!sessionPath && previous?.model
      ? { provider: previous.model.provider, model: previous.model.id }
      : {}),
  })
  runningCwd = cwd
  if (!sessionPath && previous) {
    await rpcClient.send({ type: 'set_thinking_level', level: previous.thinkingLevel })
  }
}

export interface BootOptions {
  cwd: string
  sessionPath: string | null
  current: () => boolean
  previous: SessionState | null
  wasStreaming: boolean
  forceCold: boolean
  /** 进程就绪后若内存缓存或磁盘快照已水合完毕，则跳过 get_messages 跨进程大包传输 */
  hasHydratedMessages?: () => Promise<boolean> | boolean
}

/**
 * 同项目切换会话直接复用运行中的 pi 进程（switch_session / new_session，约十余毫秒），
 * 仅在首次启动、切换项目目录、进程异常退出或显式重连时才冷启新进程。
 */
export async function bootSession({
  cwd,
  sessionPath,
  current,
  previous,
  wasStreaming,
  forceCold,
  hasHydratedMessages,
}: BootOptions) {
  const startup = launch.then(async () => {
    if (!current()) return
    const warmed = !forceCold && (await tryWarmSwitch(cwd, sessionPath, wasStreaming))
    if (!warmed && current()) {
      await coldStart(cwd, sessionPath, previous)
    }
  })
  launch = startup.catch(() => undefined)
  await startup
  if (!current()) return null

  const skipMessages = (await hasHydratedMessages?.()) ?? false
  const [state, messagesData] = await Promise.all([
    rpcClient.send<SessionState>({ type: 'get_state' }),
    sessionPath && !skipMessages
      ? rpcClient.send<MessagesData>({ type: 'get_messages' })
      : Promise.resolve<MessagesData | null>(null),
  ])
  if (!current()) return null
  return { state, messages: messagesData ? (messagesData.messages ?? []) : null }
}
