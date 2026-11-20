import { mergeToolRounds } from './mergeToolRounds'
import type { ChatAssistantMessage, ChatMessage, ChatUserMessage } from '@/store/chat'

/**
 * 一次交互：一条用户消息，以及它触发的全部助手轮次。
 *
 * pi 一次 prompt 可能产生多个 turn（每次工具调用后模型再说一轮），
 * 但对用户而言这是一件事。最后一轮通常是汇报，前面的属于过程。
 */
export interface Exchange {
  /** 发起这次交互的用户消息；会话开头可能没有 */
  user: ChatUserMessage | null
  /** 过程轮次，完成后默认折叠 */
  intermediate: ChatAssistantMessage[]
  /** 最后一轮，即汇报，始终展示 */
  final: ChatAssistantMessage | null
  /** 夹在助手轮次之间的直接 bash 执行等其它消息 */
  others: ChatMessage[]
  /** 从用户发问到最后一轮结束的耗时，信息不足时为 null */
  durationMs: number | null
}

function isUser(m: ChatMessage): m is ChatUserMessage {
  return m.role === 'user'
}

function build(user: ChatUserMessage | null, buffer: ChatMessage[]): Exchange {
  const assistants = mergeToolRounds(buffer)
  const rawFinal = assistants.length > 0 ? assistants[assistants.length - 1] : null
  const { intermediate, final } = splitToolRounds(assistants.slice(0, -1), rawFinal)

  // toolResult 由 ToolCallBlock 依 toolCallId 自行取用，不在这里重复渲染
  const others = buffer.filter((m) => m.role === 'bashExecution')

  const startedAt = user?.timestamp ?? assistants[0]?.timestamp ?? null
  const endedAt = rawFinal?.timestamp ?? null

  return {
    user,
    intermediate,
    final,
    others,
    durationMs: startedAt !== null && endedAt !== null ? Math.max(0, endedAt - startedAt) : null,
  }
}

/**
 * 将最后一轮消息内的工具调用拨入过程区，外层 final 只保留工具调用之后的正文总结：
 * - 流式运行中：避免 mergeToolRounds 合并连续工具轮次时 intermediate 与 final 反复横跳导致列表跳回顶部；
 * - 响应完成后：所有工具过程随 ProcessArea 一同折叠，外层仅展示最后一轮总结文案与改动卡片。
 */
function splitToolRounds(
  intermediate: ChatAssistantMessage[],
  final: ChatAssistantMessage | null,
): { intermediate: ChatAssistantMessage[]; final: ChatAssistantMessage | null } {
  if (!final) return { intermediate, final }

  let lastToolIdx = -1
  for (let i = final.content.length - 1; i >= 0; i -= 1) {
    if (final.content[i]?.type === 'toolCall') {
      lastToolIdx = i
      break
    }
  }
  if (lastToolIdx === -1) return { intermediate, final }

  const processPart: ChatAssistantMessage = {
    ...final,
    content: final.content.slice(0, lastToolIdx + 1),
    thinking: undefined,
  }
  const restContent = final.content.slice(lastToolIdx + 1)
  const hasTrailingThinking = restContent.some((b) => b.type === 'thinking')
  const summaryPart: ChatAssistantMessage = {
    ...final,
    content: restContent,
    thinking: hasTrailingThinking ? final.thinking : undefined,
  }
  return {
    intermediate: [...intermediate, processPart],
    final: summaryPart,
  }
}

/**
 * 把平铺的消息序列切分成一次次交互。
 *
 * 以用户消息为分界，而不是依赖 turn_start/turn_end 事件——
 * 历史会话是一次性读回来的，没有事件可依，两条路径共用同一套推断才不会有两种表现。
 */
export function groupIntoExchanges(messages: ChatMessage[]): Exchange[] {
  const result: Exchange[] = []
  let user: ChatUserMessage | null = null
  let buffer: ChatMessage[] = []
  let started = false

  for (const message of messages) {
    if ((message as { role?: string }).role === 'system') continue
    if (isUser(message)) {
      if (started) result.push(build(user, buffer))
      user = message
      buffer = []
      started = true
      continue
    }
    buffer.push(message)
    started = true
  }

  if (started) result.push(build(user, buffer))
  return result
}
