/**
 * pi RPC 的消息与模型类型，1:1 对应 pi 官方文档的 Types 章节。
 * 这里是全局唯一来源，其他模块一律从 @/rpc/types 引入，不得各自重复定义。
 */

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type ApiType =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'

export interface ModelCost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface Model {
  id: string
  name: string
  api: ApiType
  provider: string
  baseUrl: string
  reasoning: boolean
  input: Array<'text' | 'image'>
  contextWindow: number
  maxTokens: number
  cost: ModelCost
  thinkingLevelMap?: Record<string, string | null>
  compat?: Record<string, unknown>
}

/* ---------- 内容块 ---------- */

export interface TextContent {
  type: 'text'
  text: string
}

export interface ImageContent {
  type: 'image'
  data: string
  mimeType: string
}

export interface ThinkingContent {
  type: 'thinking'
  thinking: string
}

export interface ToolCallContent {
  type: 'toolCall'
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type ContentBlock = TextContent | ImageContent | ThinkingContent | ToolCallContent

/* ---------- 用量 ---------- */

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens?: number
  cost?: ModelCost & { total: number }
}

/* ---------- 消息 ---------- */

export type StopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'

export interface UserMessage {
  role: 'user'
  content: string | Array<TextContent | ImageContent>
  timestamp: number
}

export interface AssistantMessage {
  role: 'assistant'
  content: ContentBlock[]
  api: ApiType
  provider: string
  model: string
  usage?: Usage
  stopReason?: StopReason
  timestamp: number
  errorMessage?: string
}

export interface ToolResultMessage {
  role: 'toolResult'
  toolCallId: string
  toolName: string
  details?: Record<string, unknown>
  content: Array<TextContent | ImageContent>
  usage?: Usage
  isError: boolean
  timestamp: number
}

export interface BashExecutionMessage {
  role: 'bashExecution'
  command: string
  output: string
  exitCode: number
  cancelled: boolean
  truncated: boolean
  fullOutputPath: string | null
  timestamp: number
}

export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage

export interface ToolResult {
  content: Array<TextContent | ImageContent>
  details?: Record<string, unknown>
}
