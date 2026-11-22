import type { AgentMessage } from '@/rpc/types'
import { userText } from '@/shared/utils/message'
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

/**
 * 同一条 user 消息是否已经落库。
 *
 * 正常情况下 message_end 只来一次；但重复投递或重连回放同一帧时，第一条
 * 已经进了 messages、本地回显也已清掉，第二条再走 dropLocalEcho 找不到
 * 回显，就会原样追加成两个气泡。按角色 + 时间戳 + 正文判定同一条消息：
 * 两次真实发送不可能共用同一个 Date.now()，不会误伤连续发两句相同的话。
 */
function isDuplicateUserMessage(messages: ChatMessage[], incoming: AgentMessage): boolean {
  if (incoming.role !== 'user') return false
  const last = messages.at(-1)
  return (
    last?.role === 'user' &&
    last.timestamp === incoming.timestamp &&
    userText(last) === userText(incoming)
  )
}

/** 把一条完成的消息并入历史，并清掉对应的流式占位 */
export function commitMessage(state: ChatSnapshot, message: AgentMessage): ChatSnapshot {
  if ((message as { role?: string }).role === 'system') return state
  if (isDuplicateUserMessage(state.messages, message)) return state
  const alreadyStreamed = state.streaming !== null && message.role === 'assistant'
  const { messages, replaced: replacedEcho } = dropLocalEcho(state.messages, message)
  const committed = isSteered(state, message, replacedEcho)
    ? { ...message, steered: true }
    : message
  return {
    ...state,
    messages: [...messages, stampCompleted(sealThinking(committed, state.streaming))],
    streaming: alreadyStreamed ? null : state.streaming,
    compactedTokens: message.role === 'assistant' ? null : state.compactedTokens,
  }
}

/**
 * 给刚落定的助手消息打上结束时刻。
 *
 * 快照路径由 Rust 按文件条目时间补 completedAt，实时路径没有那个条目，
 * 就在这里补。缺了它，「耗时」只能拿开始时刻去算，永远显示 0 秒。
 */
function stampCompleted(message: ChatMessage): ChatMessage {
  return message.role === 'assistant'
    ? { ...message, completedAt: new Date().toISOString() }
    : message
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
 * 先按正文精确匹配，把所有同文的 local 占位都清掉。只删「最早一条」时，
 * 一旦 store 里积了两条同文回显（发送键与输入法提交撞在一起、或切会话时
 * 旧回显没来得及清），权威消息只顶掉其中一条，另一条就会留下来和它并排
 * 显示成两个气泡——Windows 上报的就是这个形态。
 *
 * 文本匹配不上时再退回「删最早一条」：开启图片自动缩放时 pi 会在正文后
 * 追加 `[Image: original WxH, displayed at ...]` 坐标换算说明，或展开斜杠
 * 模板，导致权威文本与本地原文不同，此时只能按先后顺序认领占位。
 */
function dropLocalEcho(
  messages: ChatMessage[],
  incoming: AgentMessage,
): { messages: ChatMessage[]; replaced: boolean } {
  if (incoming.role !== 'user') return { messages, replaced: false }

  const incomingText = userText(incoming)
  const matched = messages.filter(
    (item) => item.local && item.role === 'user' && userText(item) === incomingText,
  )
  if (matched.length > 0) {
    return {
      messages: messages.filter((item) => !matched.includes(item)),
      replaced: true,
    }
  }

  const idx = messages.findIndex((item) => item.local && item.role === 'user')
  return idx === -1
    ? { messages, replaced: false }
    : { messages: [...messages.slice(0, idx), ...messages.slice(idx + 1)], replaced: true }
}
