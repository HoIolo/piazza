import type { ContentBlock } from '@/rpc/types'
import type { ChatAssistantMessage, ChatMessage } from '@/store/chat'

function isVisible(block: ContentBlock): boolean {
  return block.type !== 'thinking' && (block.type !== 'text' || Boolean(block.text.trim()))
}

function endsWithTool(message: ChatAssistantMessage) {
  if (message.errorMessage || message.stopReason === 'error' || message.stopReason === 'aborted')
    return false
  return [...message.content].reverse().find(isVisible)?.type === 'toolCall'
}

function onlyTools(message: ChatAssistantMessage) {
  const visible = message.content.filter(isVisible)
  return visible.length > 0 && visible.every((block) => block.type === 'toolCall')
}

function mergeThinking(previous: ChatAssistantMessage, current: ChatAssistantMessage) {
  const durations = [previous.thinking?.durationMs, current.thinking?.durationMs].filter(
    (value): value is number => value != null,
  )
  return {
    startedAt: current.thinking?.startedAt ?? null,
    durationMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) : null,
  }
}

/** 工具连续跨轮出现时仍用一组。正文、错误和独立终端输出保留边界。 */
export function mergeToolRounds(messages: ChatMessage[]): ChatAssistantMessage[] {
  const result: ChatAssistantMessage[] = []
  let previous: ChatAssistantMessage | undefined
  for (const message of messages) {
    if (message.role === 'bashExecution') previous = undefined
    if (message.role !== 'assistant') continue
    if (previous && endsWithTool(previous) && onlyTools(message)) {
      previous = {
        ...message,
        content: [...previous.content, ...message.content],
        thinking: mergeThinking(previous, message),
      }
      result[result.length - 1] = previous
    } else {
      result.push(message)
      previous = message
    }
  }
  return result
}
