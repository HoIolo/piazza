import type { AgentMessage, ToolResultMessage } from '@/rpc/types'
import type { ToolExecution } from './types'

/** 历史会话只有消息记录。按工具 ID 还原展开明细所需的结果和参数。 */
export function restoreTools(messages: AgentMessage[]): Record<string, ToolExecution> {
  const results = new Map<string, ToolResultMessage>()
  const tools: Record<string, ToolExecution> = Object.create(null)
  for (const message of messages) {
    if (message.role === 'toolResult') results.set(message.toolCallId, message)
  }
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const block of message.content) {
      if (block.type !== 'toolCall') continue
      const result = results.get(block.id)
      tools[block.id] = {
        toolCallId: block.id,
        toolName: block.name,
        args: block.arguments,
        status: 'done',
        isError: result?.isError ?? false,
        result: result && { content: result.content },
      }
    }
  }
  return tools
}
