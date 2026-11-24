import { rpcClient, type ExitInfo } from '@/rpc/client'
import type { AvailableModels, MessagesData, SessionState } from '@/rpc/types'
import { isPlaceholderModel } from './modelFallback'
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
const WARM_SWITCH_TIMEOUT_MS = 6_000
const BOOT_QUERY_TIMEOUT_MS = 15_000

export function startWatchdog(
  isCancelled: () => boolean,
  onTimeout: (err: ChatError) => void,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    if (isCancelled()) return
    onTimeout({
      message: '启动会话超时',
      detail: `等待 ${BOOT_TIMEOUT_MS / 1000} 秒仍未就绪。Piazza 可能没能启动后台会话，或启动后没有响应。`,
      fatal: true,
    })
  }, BOOT_TIMEOUT_MS)
}

export function describeExit({ code, stderr }: ExitInfo): ChatError {
  const detail = stderr.trim() || undefined
  if (code === null) {
    return { message: '会话进程被终止', detail: detail ?? '进程被信号杀死。', fatal: true }
  }
  if (code === 0) {
    return {
      message: '会话进程已退出',
      detail: detail ?? '进程以退出码 0 正常结束，通常意味着与它的连接被切断。',
      fatal: true,
    }
  }
  return { message: `会话进程异常退出（退出码 ${code}）`, detail, fatal: true }
}

async function tryWarmSwitch(
  slotId: string,
  cwd: string,
  sessionPath: string | null,
): Promise<boolean> {
  if (slotCwds.get(slotId) !== cwd) return false
  try {
    const res = sessionPath
      ? await rpcClient.send<SwitchResult>(
          { type: 'switch_session', sessionPath },
          slotId,
          WARM_SWITCH_TIMEOUT_MS,
        )
      : await rpcClient.send<SwitchResult>({ type: 'new_session' }, slotId, WARM_SWITCH_TIMEOUT_MS)
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
  // 显式重连/故障恢复时不排在可能已卡死的上一次启动后面，直接冷启替换旧进程
  const prevLaunch = forceCold ? Promise.resolve() : (slotLaunches.get(slotId) ?? Promise.resolve())
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

  const [rawState, messagesData] = await Promise.all([
    rpcClient.send<SessionState>({ type: 'get_state' }, slotId, BOOT_QUERY_TIMEOUT_MS),
    sessionPath
      ? rpcClient.send<MessagesData>({ type: 'get_messages' }, slotId, BOOT_QUERY_TIMEOUT_MS)
      : Promise.resolve<MessagesData | null>(null),
  ])
  if (!current()) return null
  const state = await adoptModelIfMissing(rawState, slotId)
  if (!current()) return null
  return { state, messages: messagesData ? (messagesData.messages ?? []) : null }
}

/**
 * 没配到模型时 pi 报的是 unknown 占位，不是 null。这时主动挑一个可用模型设上——
 * 用户刚加完模型回到会话，输入框底下不该还空着等他再去点一次。
 */
async function adoptModelIfMissing(state: SessionState, slotId: string): Promise<SessionState> {
  if (!isPlaceholderModel(state.model)) return state
  try {
    const { models = [] } = await rpcClient.send<AvailableModels>(
      { type: 'get_available_models' },
      slotId,
      BOOT_QUERY_TIMEOUT_MS,
    )
    const pick = models[0]
    if (!pick) return state
    await rpcClient.send(
      { type: 'set_model', provider: pick.provider, modelId: pick.id },
      slotId,
      BOOT_QUERY_TIMEOUT_MS,
    )
    return await rpcClient.send<SessionState>({ type: 'get_state' }, slotId, BOOT_QUERY_TIMEOUT_MS)
  } catch {
    // 兜底失败就保持原样，界面会显示「未选择模型」，用户还能自己点
    return state
  }
}
