import { rpcClient } from '@/rpc/client'
import { RESUME_COMMAND } from '@/rpc/visibleCommands'
import type { ImageContent, StreamingBehavior } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { forgetSteer, rememberSteer } from './pendingSteers'
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
  const echoId = !running ? echoUserMessage(text, images) : null
  const type = promptType(running, behavior)
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

export async function resumeTurn(): Promise<boolean> {
  const state = useChatStore.getState()
  if (!state.paused || state.isStreaming || !state.rpcReady || state.messages.at(-1)?.local) {
    return false
  }
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
