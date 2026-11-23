import { rpcClient } from '@/rpc/client'
import type { AvailableModels, SessionState } from '@/rpc/types'
import { useAppStore } from '@/store/app.store'
import { isPlaceholderModel } from './modelFallback'
import { useChatStore } from './store'
import { hasPendingWork } from './types'

/**
 * 设置里改完配置后，让会话看到新配置。
 *
 * 以前这里是「重连」——也就是杀掉整个 worker 再冷启一个。代价 500ms 起步，
 * 期间模型选择器显示「Pi 会话未就绪」，用户回到会话第一眼就是个空档。
 *
 * 但绝大多数设置项（模型列表、账号、技能、扩展）都不需要换进程：
 *   - 模型列表：ModelRuntime 在内存里，调 refresh_models 让它重读盘即可；
 *   - 其余项：下一次 switch_session / new_session 时 pi 会自己重读。
 * 只有确实需要新进程的（换了 provider 的可执行文件之类）才真的重连。
 *
 * 所以这里改成：先原地刷新模型列表，失败或会话不可用时才退回重连。
 */
export async function refreshRuntimeAfterSave(): Promise<void> {
  const chat = useChatStore.getState()
  if (!chat.rpcReady || hasPendingWork(chat)) {
    // 正在跑或进程还没就绪：等它空下来再刷新，别打断当前回合
    scheduleIdleRefresh()
    return
  }
  await refreshModelsInPlace()
}

let idleTimer: ReturnType<typeof setTimeout> | undefined
let unsubscribe: (() => void) | undefined

/** 等当前回合结束后再刷新，只订阅一次 */
function scheduleIdleRefresh(): void {
  unsubscribe ??= useChatStore.subscribe(() => {
    const chat = useChatStore.getState()
    if (hasPendingWork(chat) || chat.sessionLoading) return
    unsubscribe?.()
    unsubscribe = undefined
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => void refreshModelsInPlace(), 300)
  })
}

/**
 * 让 pi 重读 models.json。
 *
 * 顺带处理一个边界：改完模型后当前会话的模型可能已经不在列表里（被删掉或改名），
 * 这时 pi 的 get_state 会退回占位对象，界面显示「未选择模型」。这里顺手挑一个可用
 * 的补上，用户不必自己去点一次。
 */
async function refreshModelsInPlace(): Promise<void> {
  const chat = useChatStore.getState()
  if (!chat.rpcReady) return
  try {
    await rpcClient.send<AvailableModels>({ type: 'refresh_models' })
    const state = await rpcClient.send<SessionState>({ type: 'get_state' })
    if (!isPlaceholderModel(state.model)) {
      chat.setSession(state)
      return
    }
    const { models } = await rpcClient.send<AvailableModels>({ type: 'get_available_models' })
    const pick = models[0]
    if (!pick) return
    await rpcClient.send({ type: 'set_model', provider: pick.provider, modelId: pick.id })
    chat.setSession(await rpcClient.send<SessionState>({ type: 'get_state' }))
  } catch {
    // 原地刷新失败（比如 worker 已经不在了）才退回重连
    const app = useAppStore.getState()
    if (app.currentCwd) app.reconnectSession()
  }
}
