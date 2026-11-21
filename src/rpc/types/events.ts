/** pi RPC 的事件类型，对应文档 Events 章节 */
import type { ExtensionUiRequest } from './extensionUi'
import type {
  AgentMessage,
  AssistantMessage,
  ToolCallContent,
  ToolResult,
  ToolResultMessage,
} from './messages'

/**
 * 流式增量事件。
 *
 * 注意：pi 官方文档描述这些事件带有 `partial`（当前累积的完整消息），
 * 但 v0.82.1 实测**并没有**该字段，只有 contentIndex 与 delta/content。
 * 因此客户端必须自行按 contentIndex 累积内容。以下类型以实测为准。
 */
export type AssistantMessageEvent =
  | { type: 'start' }
  | { type: 'text_start'; contentIndex: number }
  | { type: 'text_delta'; contentIndex: number; delta: string }
  | { type: 'text_end'; contentIndex: number; content: string }
  | { type: 'thinking_start'; contentIndex: number }
  | { type: 'thinking_delta'; contentIndex: number; delta: string }
  | { type: 'thinking_end'; contentIndex: number; content: string }
  | { type: 'toolcall_start'; contentIndex: number }
  | { type: 'toolcall_delta'; contentIndex: number; delta: string }
  | { type: 'toolcall_end'; contentIndex: number; toolCall: ToolCallContent }
  | { type: 'done'; reason: 'stop' | 'length' | 'toolUse' }
  | { type: 'error'; reason: 'aborted' | 'error' }

export type AgentEvent =
  | { type: 'agent_start' }
  | { type: 'piazza_title_pending'; pending: boolean }
  | { type: 'session_info_changed'; name?: string }
  | { type: 'agent_end'; messages: AgentMessage[]; willRetry: boolean }
  | { type: 'agent_settled'; aborted?: boolean }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: AssistantMessage; toolResults: ToolResultMessage[] }
  | { type: 'message_start'; message: AgentMessage }
  | { type: 'message_end'; message: AgentMessage }
  | {
      // 实测无 message 字段，内容需由客户端按 assistantMessageEvent 累积
      type: 'message_update'
      assistantMessageEvent: AssistantMessageEvent
    }
  | { type: 'bash_execution_update'; id?: string; delta: string }
  | {
      type: 'tool_execution_start'
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
    }
  | {
      type: 'tool_execution_update'
      toolCallId: string
      toolName: string
      args: Record<string, unknown>
      partialResult: ToolResult
    }
  | {
      type: 'tool_execution_end'
      toolCallId: string
      toolName: string
      result: ToolResult
      isError: boolean
    }
  | { type: 'queue_update'; steering: string[]; followUp: string[] }
  | { type: 'compaction_start'; reason?: 'threshold' | 'overflow' | 'manual' }
  | {
      type: 'compaction_end'
      reason?: 'threshold' | 'overflow' | 'manual'
      result?: { tokensBefore?: number; estimatedTokensAfter?: number }
      aborted?: boolean
      willRetry?: boolean
      errorMessage?: string
    }
  | { type: 'auto_retry_start'; attempt?: number; delayMs?: number }
  | { type: 'auto_retry_end'; success?: boolean }
  | { type: 'extension_error'; error: string }
  /* 扩展向客户端索取用户输入，详见 extensionUi.ts */
  | ExtensionUiRequest

/** 命令的应答帧 */
export interface RpcResponse<T = unknown> {
  type: 'response'
  id?: string
  command: string
  success: boolean
  data?: T
  error?: string
}

/** 从 stdout 收到的任意一帧：要么是命令应答，要么是 agent 事件 */
export type RpcFrame = RpcResponse | AgentEvent
