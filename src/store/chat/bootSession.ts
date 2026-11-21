import { rpcClient, type ExitInfo } from '@/rpc/client'
import type { MessagesData, SessionState } from '@/rpc/types'
import type { ChatError } from './types'

interface SwitchResult {
  cancelled?: boolean
}

const slotLaunches = new Map<string, Promise<void>>()
const slotCwds = new Map<string, string>()

export function getSlotCwd(slotId: string): string | null {
  return slotCwds.get(slotId) ?? null
}

export function markRpcProcessExited(slotId: string): void {
  slotCwds.delete(slotId)
  slotLaunches.delete(slotId)
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
  slotId: string,
  cwd: string,
  sessionPath: string | null,
): Promise<boolean> {
  if (slotCwds.get(slotId) !== cwd) return false
  try {
    const res = sessionPath
      ? await rpcClient.send<SwitchResult>({ type: 'switch_session', sessionPath }, slotId)
      : await rpcClient.send<SwitchResult>({ type: 'new_session' }, slotId)
    return !res?.cancelled
  } catch {
    slotCwds.delete(slotId)
    return false
  }
}

async function coldStart(
  slotId: string,
  cwd: string,
  sessionPath: string | null,
  previous: SessionState | null,
): Promise<void> {
  slotCwds.delete(slotId)
  await rpcClient.start(
    {
      cwd,
      sessionPath: sessionPath ?? undefined,
      ...(!sessionPath && previous?.model
        ? { provider: previous.model.provider, model: previous.model.id }
        : {}),
    },
    slotId,
  )
  slotCwds.set(slotId, cwd)
  if (!sessionPath && previous) {
    await rpcClient.send({ type: 'set_thinking_level', level: previous.thinkingLevel }, slotId)
  }
}

export interface BootOptions {
  slotId: string
  cwd: string
  sessionPath: string | null
  current: () => boolean
  previous: SessionState | null
  forceCold: boolean
}

/**
 * 同项目切换空闲会话直接复用当前槽位的 pi 进程（switch_session / new_session，约十余毫秒），
 * 仅在首次启动、切换项目目录、进程异常退出、从流式会话切走新开槽位或显式重连时才冷启新进程。
 */
export async function bootSession({
  slotId,
  cwd,
  sessionPath,
  current,
  previous,
  forceCold,
}: BootOptions) {
  const prevLaunch = slotLaunches.get(slotId) ?? Promise.resolve()
  const startup = prevLaunch.then(async () => {
    if (!current()) return
    const warmed = !forceCold && (await tryWarmSwitch(slotId, cwd, sessionPath))
    if (!warmed && current()) {
      await coldStart(slotId, cwd, sessionPath, previous)
    }
  })
  slotLaunches.set(
    slotId,
    startup.catch(() => undefined),
  )
  await startup
  if (!current()) return null

  const [state, messagesData] = await Promise.all([
    rpcClient.send<SessionState>({ type: 'get_state' }, slotId),
    sessionPath
      ? rpcClient.send<MessagesData>({ type: 'get_messages' }, slotId)
      : Promise.resolve<MessagesData | null>(null),
  ])
  if (!current()) return null
  return { state, messages: messagesData ? (messagesData.messages ?? []) : null }
}
