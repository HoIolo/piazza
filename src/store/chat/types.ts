import type {
  AgentMessage,
  AssistantMessage,
  ExtensionUiDialog,
  ToolResult,
  UserMessage,
} from '@/rpc/types'

/**
 * 思考计时。
 *
 * pi 不报思考耗时，这里是 GUI 按事件到达时刻自己量的，所以挂在包装类型上，
 * 不动 rpc/types 那份协议原样。
 *
 * 量的正是界面显示「正在思考」的那段时间：从助手消息开始，到第一个非思考
 * 内容出现为止。让数字和文案说同一件事，两者才不会互相打架。
 */
export interface ThinkingTiming {
  /** 本段思考的开始时刻；已停表时为 null */
  startedAt: number | null
  /** 已累计的思考时长；一次都没停过表时为 null */
  durationMs: number | null
}

/**
 * GUI 自己观测出来的附加字段，pi 的协议里没有这些。
 *
 * local 标记「本地回显」：发送那一刻就先把用户消息挂上去，不等 pi 回传。
 * 否则一旦命令没能送到 pi（会话没起来、进程已退出），用户打的字会连同
 * 草稿一起消失，界面上看不出他发过任何东西。
 * pi 随后回传同一条时会就地替换，所以不会重复。
 */
interface ChatExtras {
  local?: boolean
  localId?: string
  /**
   * 运行中插进来的用户消息（引导 / 追加），不属于新一轮。
   *
   * 这类消息不是「发一个新问题」，而是往正在跑的那一轮里补一句话，
   * 所以不切新一轮、也不让上一轮的过程区收起来。
   */
  steered?: boolean
  thinking?: ThinkingTiming
}

/** 消息列表元素 */
export type ChatMessage = AgentMessage & ChatExtras

/** 助手消息在 GUI 里的形态。流式中与已落定的都用它，两条路径共用一套渲染 */
export type ChatAssistantMessage = AssistantMessage & ChatExtras

export type ChatUserMessage = UserMessage & ChatExtras

/** 单次工具调用的执行状态，以 toolCallId 关联 start/update/end 三个事件 */
export interface ToolExecution {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  partialResult?: ToolResult
  result?: ToolResult
  isError: boolean
  status: 'running' | 'done'
}

/** 聊天区顶部要报的错。带 detail 是因为进程死因这类信息一行放不下 */
export interface ChatError {
  message: string
  /** 附加细节，如 pi 退出前的 stderr */
  detail?: string
  /** 会话已经断了，光关掉提示没用，必须重连 */
  fatal?: boolean
}

/** 聊天区的完整可渲染状态 */
export interface ChatSnapshot {
  /** 当前展示的消息流所归属的会话标识，与 messages 在同一次状态提交里原子更新，防止切会话时提前重排旧消息 */
  viewKey: string
  /** 已完成的消息 */
  messages: ChatMessage[]
  /** 正在流式输出的助手消息，null 表示当前没有流 */
  streaming: ChatAssistantMessage | null
  /** 按 toolCallId 索引的工具执行状态 */
  tools: Record<string, ToolExecution>
  isStreaming: boolean
  isCompacting: boolean
  /** 本会话内完成过的压缩次数，用来触发上下文用量环重新拉取统计 */
  compactionCount: number
  /** 刚完成压缩、尚未产生新助手回复时的估算 token 数 */
  compactedTokens: number | null
  paused: boolean
  titlePending: boolean
  /** 本轮开始时间，用于「已处理 3m 15s」计时 */
  turnStartedAt: number | null
  /** 上一轮耗时（毫秒） */
  lastTurnDurationMs: number | null
  /** 排队中的引导/追加消息 */
  queue: { steering: string[]; followUp: string[] }
  /** 正在启动 pi 会话 / 拉取历史消息（仅在尚无任何消息可展示时显示骨架） */
  sessionLoading: boolean
  /** pi 进程是否已完成本次会话切换并就绪，控制发送与 RPC 查询 */
  rpcReady: boolean
  /** 磁盘快照或缓存带出的会话标题，供 pi 尚未返回 state 前展示 */
  previewName: string | null
  /**
   * 待用户回应的扩展 UI 请求。
   * 存在时说明这次运行卡在等人回答，侧栏与聊天区据此给出提示。
   */
  pendingDialog: ExtensionUiDialog | null
  error: ChatError | null
}

export type ChatRowStatus = 'loading' | 'working' | 'reply' | 'input' | 'confirm' | null

export function deriveSessionStatus(s: ChatSnapshot): ChatRowStatus {
  if (s.sessionLoading) return 'loading'
  if (s.pendingDialog) return s.pendingDialog.method === 'confirm' ? 'confirm' : 'input'
  if (s.isCompacting) return 'working'
  if (!s.isStreaming) return null
  return s.streaming?.content.length || Object.values(s.tools).some((t) => t.status === 'running')
    ? 'working'
    : 'reply'
}

export function wasPaused(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role === 'assistant') return message.stopReason === 'aborted'
    if (message.role === 'user') return false
  }
  return false
}

export function emptySnapshot(): ChatSnapshot {
  return {
    viewKey: 'init',
    messages: [],
    streaming: null,
    tools: {},
    isStreaming: false,
    isCompacting: false,
    compactionCount: 0,
    compactedTokens: null,
    paused: false,
    titlePending: false,
    turnStartedAt: null,
    lastTurnDurationMs: null,
    queue: { steering: [], followUp: [] },
    sessionLoading: false,
    rpcReady: false,
    previewName: null,
    pendingDialog: null,
    error: null,
  }
}

export function backgroundSnapshot(state: ChatSnapshot): ChatSnapshot {
  return {
    viewKey: state.viewKey,
    messages: state.messages,
    streaming: state.streaming,
    tools: state.tools,
    isStreaming: state.isStreaming,
    isCompacting: state.isCompacting,
    compactionCount: state.compactionCount,
    compactedTokens: state.compactedTokens,
    paused: state.paused,
    titlePending: state.titlePending,
    turnStartedAt: state.turnStartedAt,
    lastTurnDurationMs: state.lastTurnDurationMs,
    queue: state.queue,
    sessionLoading: false,
    rpcReady: state.rpcReady,
    previewName: state.previewName,
    pendingDialog: state.pendingDialog,
    error: state.error,
  }
}

export function hasPendingWork(state: ChatSnapshot) {
  return state.isStreaming || state.isCompacting || state.titlePending
}
