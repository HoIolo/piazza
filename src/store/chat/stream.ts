import type { AssistantMessageEvent, ContentBlock } from '@/rpc/types'
import type { ChatAssistantMessage } from './types'

/**
 * 按 contentIndex 累积流式内容。
 *
 * pi v0.82.1 的 message_update 只给出增量（delta），不给当前完整消息——
 * 官方文档描述的 `partial` 字段实际并不存在。因此内容必须在这里自行拼接。
 * `*_end` 事件会带上该块的完整文本，用它覆盖累积结果，以纠正任何拼接偏差。
 */
export function applyDelta(
  streaming: ChatAssistantMessage | null,
  event: AssistantMessageEvent,
): ChatAssistantMessage | null {
  if (!streaming) return null
  if (!('contentIndex' in event)) return streaming

  const content = padTo(streaming.content, event.contentIndex)
  const block = buildBlock(content[event.contentIndex], event)
  if (!block) return streaming

  content[event.contentIndex] = block
  return { ...streaming, content }
}

/** contentIndex 可能跳跃，用空文本块填补空洞，避免数组出现 undefined */
function padTo(content: ContentBlock[], index: number): ContentBlock[] {
  const next = [...content]
  while (next.length <= index) {
    next.push({ type: 'text', text: '' })
  }
  return next
}

function buildBlock(
  current: ContentBlock | undefined,
  event: AssistantMessageEvent,
): ContentBlock | null {
  return buildTextual(current, event) ?? buildToolCall(current, event)
}

/** 文本与思考：两者累积方式一致，只是承载字段不同 */
function buildTextual(
  current: ContentBlock | undefined,
  event: AssistantMessageEvent,
): ContentBlock | null {
  switch (event.type) {
    case 'text_start':
      return { type: 'text', text: '' }
    case 'text_delta':
      return { type: 'text', text: textOf(current) + event.delta }
    case 'text_end':
      return { type: 'text', text: event.content }
    case 'thinking_start':
      return { type: 'thinking', thinking: '' }
    case 'thinking_delta':
      return { type: 'thinking', thinking: thinkingOf(current) + event.delta }
    case 'thinking_end':
      return { type: 'thinking', thinking: event.content }
    default:
      return null
  }
}

/**
 * 工具调用：流式期间的参数是不完整的 JSON 片段，没有展示价值，
 * 因此只在 toolcall_end 落地完整对象。
 */
function buildToolCall(
  current: ContentBlock | undefined,
  event: AssistantMessageEvent,
): ContentBlock | null {
  switch (event.type) {
    case 'toolcall_end':
      return event.toolCall
    case 'toolcall_start':
    case 'toolcall_delta':
      return current ?? { type: 'text', text: '' }
    default:
      return null
  }
}

function textOf(block: ContentBlock | undefined): string {
  return block?.type === 'text' ? block.text : ''
}

function thinkingOf(block: ContentBlock | undefined): string {
  return block?.type === 'thinking' ? block.thinking : ''
}
