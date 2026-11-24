import { rpcClient } from '@/rpc/client'
import { useAppStore } from '@/store/app.store'
import { RESUME_COMMAND } from '@/rpc/visibleCommands'
import type { ImageContent, StreamingBehavior } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { forgetSteer, rememberSteer } from './pendingSteers'
import { waitForRpcReady } from './waitForRpcReady'
import { useChatStore } from './store'

/** 发问前若触发自动压缩，pi 会在压缩完成后才回 preflight 响应，需预留更长超时 */
const PROMPT_TIMEOUT_MS = 300_000

function promptType(running: boolean, behavior: StreamingBehavior) {
  if (!running) return 'prompt'
  return behavior === 'steer' ? 'steer' : 'follow_up'
}

export async function dispatchPrompt(
  message: string,
  behavior: StreamingBehavior,
  images: ImageContent[],
): Promise<boolean> {
  const text = message.trim()
  if (!text && !images.length) return false
  const { isStreaming: running, echoUserMessage } = useChatStore.getState()
  const type = promptType(running, behavior)
  // 普通发问和运行中引导都立刻在右侧落成用户气泡；仅 ⌘+Enter 显式排队留在待发队列
  const echoId =
    type === 'prompt' || type === 'steer' ? echoUserMessage(text, images, type === 'steer') : null
  /*
   * 引导记一笔，等 pi 回传时认领。不靠 isStreaming 判断「回传时是否还在跑」：
   * agent_settled 有可能抢在 user 的 message_end 前面，那时已经落回 false，
   * 引导就会被当成新一轮切开。
   */
  if (type === 'steer') rememberSteer(text)
  try {
    await rpcClient.send(
      {
        type,
        message: text,
        ...(images.length ? { images } : {}),
      },
      undefined,
      PROMPT_TIMEOUT_MS,
    )
    return true
  } catch (error) {
    if (type === 'steer') forgetSteer(text)
    if (echoId) useChatStore.getState().removeLocalEcho(echoId)
    useChatStore.getState().setError(errorMessage(error))
    return false
  }
}

/** 这一轮还有没有「继续」可点：暂停着、没在跑、末尾不是本地回显 */
function canResume(state: ReturnType<typeof useChatStore.getState>): boolean {
  return state.paused && !state.isStreaming && !state.messages.at(-1)?.local
}

/**
 * 接着跑被中断的那一轮。
 *
 * 刚切过来的会话还带着暂停标记，但 pi 可能刚 spawn、还没就绪——这时不把点击
 * 丢掉，等它就绪再发，用户不必盯着灰按钮等它变亮。
 */
export async function resumeTurn(): Promise<boolean> {
  const before = useChatStore.getState()
  if (!canResume(before)) return false
  // 用户点的是「这一条会话」，等待期间他若换了一条，这次点击就不再作数
  const target = useAppStore.getState().currentSessionPath
  const stillWanted = () => useAppStore.getState().currentSessionPath === target
  if (!before.rpcReady && !(await waitForRpcReady(stillWanted))) return false
  const state = useChatStore.getState()
  if (!canResume(state) || !stillWanted()) return false
  const slot = rpcClient.getActiveSlot()
  try {
    await rpcClient.send({ type: 'prompt', message: `/${RESUME_COMMAND}` }, slot)
    return true
  } catch (error) {
    if (rpcClient.getActiveSlot() === slot && useChatStore.getState().viewKey === state.viewKey) {
      useChatStore.getState().setError(errorMessage(error))
    }
    return false
  }
}
