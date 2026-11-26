/** pi RPC 的命令类型与命令级响应数据，对应文档 Commands 章节 */
import type { AgentMessage, ImageContent, Model, ThinkingLevel } from './messages'

export interface StartOptions {
  cwd: string
  provider?: string
  model?: string
  sessionPath?: string
  /** 临时会话，不落会话文件 */
  ephemeral?: boolean
}

export type StreamingBehavior = 'steer' | 'followUp'

export type RpcCommand =
  | {
      id?: string
      type: 'prompt'
      message: string
      images?: ImageContent[]
      streamingBehavior?: StreamingBehavior
    }
  | { id?: string; type: 'steer'; message: string; images?: ImageContent[] }
  | { id?: string; type: 'follow_up'; message: string; images?: ImageContent[] }
  | { id?: string; type: 'abort' }
  | { id?: string; type: 'new_session'; parentSession?: string }
  | { id?: string; type: 'get_state' }
  | { id?: string; type: 'get_messages' }
  | { id?: string; type: 'set_model'; provider: string; modelId: string }
  | { id?: string; type: 'get_available_models' }
  | { id?: string; type: 'set_thinking_level'; level: ThinkingLevel }
  | { id?: string; type: 'get_available_thinking_levels' }
  | { id?: string; type: 'set_auto_compaction'; enabled: boolean }
  | { id?: string; type: 'compact'; prompt?: string }
  | { id?: string; type: 'bash'; command: string }
  | { id?: string; type: 'abort_bash' }
  | { id?: string; type: 'get_session_stats' }
  | { id?: string; type: 'switch_session'; sessionPath: string }
  | { id?: string; type: 'fork'; entryId: string }
  | { id?: string; type: 'clone' }
  | { id?: string; type: 'get_fork_messages' }
  | { id?: string; type: 'set_session_name'; name: string }
  | { id?: string; type: 'export_html'; outputPath?: string }
  | { id?: string; type: 'get_commands' }
  /**
   * 让 pi 重新读 models.json 并返回最新模型列表。
   *
   * 这条不是 pi 原生命令，是 worker 里自己拦下来的（见 pi-runtime/worker.mjs
   * 的 installCustomCommands）。设置里改完模型用它，不必重启整个 worker——
   * 重启一次要 500ms，期间会话里会显示「Pi 会话未就绪」。
   */
  | { id?: string; type: 'refresh_models' }
  /** 原地内存回退会话树到目标用户消息之前（不重建扩展/MCP，保留当前选中模型） */
  | {
      id?: string
      type: 'rewind_before'
      userIndex?: number
      rawText?: string
      entryId?: string
    }
  /** 仅返回当前活跃分支的用户消息列表，避免编辑分支后 fork 选到旧分支 */
  | { id?: string; type: 'get_branch_fork_messages' }
  /** 侧边临时内存会话从指定主会话文件同步最新上下文（只读，不修改主会话文件，不改当前模型） */
  | { id?: string; type: 'seed_from_session'; sessionPath: string }

/* ---------- 各命令的 data 结构 ---------- */

export interface SessionState {
  model: Model | null
  thinkingLevel: ThinkingLevel
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: string
  followUpMode: string
  sessionFile?: string
  sessionId: string
  sessionName?: string
  autoCompactionEnabled: boolean
  messageCount: number
  pendingMessageCount: number
}

export interface AvailableModels {
  models: Model[]
}

/** 当前模型支持的思考等级。无推理能力的模型只返回 ["off"] */
export interface AvailableThinkingLevels {
  levels: ThinkingLevel[]
}

export interface MessagesData {
  messages: AgentMessage[]
}

export type CommandSource = 'extension' | 'prompt' | 'skill'

export interface PiCommand {
  name: string
  description?: string
  source: CommandSource
  location?: 'user' | 'project' | 'path'
  path?: string
}

export interface CommandsData {
  commands: PiCommand[]
}

export interface ContextUsageStats {
  tokens: number | null
  contextWindow: number
  percent: number | null
}

export interface SessionStats {
  totalTokens?: number
  totalCost?: number
  messageCount?: number
  contextTokens?: number
  contextUsage?: ContextUsageStats
}

/** export_html 的响应，path 为实际写出的文件位置 */
export interface ExportResult {
  path: string
}

export interface ForkMessage {
  entryId: string
  text: string
}

export interface ForkMessagesData {
  messages: ForkMessage[]
}

export interface ForkResult {
  text: string
  cancelled: boolean
}

export interface RewindBeforeResult {
  cancelled: boolean
  messages?: AgentMessage[]
  sessionFile?: string | null
}
