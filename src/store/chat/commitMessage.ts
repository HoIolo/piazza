import type { AgentMessage } from '@/rpc/types'
import type { ChatAssistantMessage, ChatMessage, ChatSnapshot, ThinkingTiming } from './types'

/**
 * 这条 user 消息是不是运行中插进来的（引导 / 追加）。
 *
 * 靠两个信号判断：当时还在跑，且没有本地回显可替换——空闲发问会先压一条
 * local 占位等 pi 回传换掉，而引导是在跑的时候直接投递的，不会有占位。
 */
function isSteered(state: ChatSnapshot, message: AgentMessage, replacedEcho: boolean) {
  return message.role === 'user' && state.isStreaming && !replacedEcho
}

/** 把一条完成的消息并入历史，并清掉对应的流式占位 */
export function commitMessage(state: ChatSnapshot, message: AgentMessage): ChatSnapshot {
  if ((message as { role?: string }).role === 'system') return state
  const alreadyStreamed = state.streaming !== null && message.role === 'assistant'
  const { messages, replaced: replacedEcho } = dropLocalEcho(state.messages, message)
  const committed = isSteered(state, message, replacedEcho)
    ? { ...message, steered: true }
    : message
  return {
    ...state,
    messages: [...messages, sealThinking(committed, state.streaming)],
    streaming: alreadyStreamed ? null : state.streaming,
    compactedTokens: message.role === 'assistant' ? null : state.compactedTokens,
  }
}

/**
 * 停表，并把这一段累加进总时长。
 *
 * 累加而非覆盖：一条消息里可能思考—调工具—再思考，界面把这些片段合成
 * 一段展示，时长自然也该是合起来的那个数。
 */
export function stopThinking(
  prev: ThinkingTiming | undefined,
  now: number,
): ThinkingTiming | undefined {
  if (!prev || prev.startedAt === null) return prev
  return { startedAt: null, durationMs: (prev.durationMs ?? 0) + Math.max(0, now - prev.startedAt) }
}

/**
 * 把流式期间量到的思考时长交接给落定的消息。
 *
 * message_end 带回的才是权威内容，但它不含计时；不在这里接过来，
 * 每轮一结束「已思考 12秒」就退回成光秃秃的「已思考」。
 */
function sealThinking(message: AgentMessage, streaming: ChatAssistantMessage | null): ChatMessage {
  if (message.role !== 'assistant' || !streaming) return message
  const thinking = stopThinking(streaming.thinking, Date.now())
  const content =
    message.stopReason === 'aborted' && message.content.length === 0
      ? streaming.content
      : message.content
  return { ...message, content, thinking }
}

/**
 * pi 回传权威的 user message_end 时，移除对应的本地乐观回显占位。
 *
 * 不能按纯文本严格相等比对：开启图片自动缩放时 pi 会在正文后追加
 * `[Image: original WxH, displayed at ...]` 坐标换算说明，或展开斜杠模板，
 * 导致权威文本与本地原文不同；既然本地回显只在空闲发问时压入一条占位，
 * 收到权威 user 消息时直接移除最早的 local 占位即可彻底避免双气泡。
 */
function dropLocalEcho(
  messages: ChatMessage[],
  incoming: AgentMessage,
): { messages: ChatMessage[]; replaced: boolean } {
  if (incoming.role !== 'user') return { messages, replaced: false }
  const idx = messages.findIndex((item) => item.local && item.role === 'user')
  return idx === -1
    ? { messages, replaced: false }
    : { messages: [...messages.slice(0, idx), ...messages.slice(idx + 1)], replaced: true }
}
