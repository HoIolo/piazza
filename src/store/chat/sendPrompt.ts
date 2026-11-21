import { rpcClient } from '@/rpc/client'
import { RESUME_COMMAND } from '@/rpc/visibleCommands'
import type { ImageContent, StreamingBehavior } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { useChatStore } from './store'

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
  try {
    await rpcClient.send({
      type: promptType(running, behavior),
      message: text,
      ...(images.length ? { images } : {}),
    })
    return true
  } catch (error) {
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
