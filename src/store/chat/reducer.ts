import { isDialogRequest, type AgentEvent, type AssistantMessageEvent } from '@/rpc/types'
import { commitMessage, stopThinking } from './commitMessage'
import { applyDelta } from './stream'
import {
  wasPaused,
  type ChatAssistantMessage,
  type ChatSnapshot,
  type ThinkingTiming,
  type ToolExecution,
} from './types'

/**
 * 把一个 agent 事件归约进聊天状态。纯函数，便于单独推理与测试。
 *
 * 按事件类别分派到子函数：子函数返回 null 表示「这类事件不归我管」，
 * 交给下一个处理器。这样每个处理器的分支数都保持在可读范围内。
 */
export function reduceEvent(state: ChatSnapshot, event: AgentEvent): ChatSnapshot {
  return (
    reduceLifecycle(state, event) ??
    reduceMessages(state, event) ??
    reduceTools(state, event) ??
    reduceMisc(state, event) ??
    state
  )
}

/** 运行生命周期 */
function reduceLifecycle(state: ChatSnapshot, event: AgentEvent): ChatSnapshot | null {
  switch (event.type) {
    case 'agent_start':
      return { ...state, isStreaming: true, paused: false, error: null, turnStartedAt: Date.now() }
    case 'agent_settled': {
      const paused = event.aborted || wasPaused(state.messages)
      const messages =
        paused && state.streaming
          ? [...state.messages, { ...state.streaming, stopReason: 'aborted' as const }]
          : state.messages
      return {
        ...state,
        isStreaming: false,
        paused,
        messages,
        streaming: null,
        lastTurnDurationMs: state.turnStartedAt ? Date.now() - state.turnStartedAt : null,
        turnStartedAt: null,
        // 运行已结束，任何未回应的对话都不会再有人接，留着只会挂住界面
        pendingDialog: null,
      }
    }
    default:
      return null
  }
}

/**
 * 消息流。
 *
 * message_update 只携带增量，不含当前完整消息（pi 官方文档写有 `partial`，
 * v0.82.1 实测没有），因此交给 applyDelta 按 contentIndex 自行累积。
 */
function reduceMessages(state: ChatSnapshot, event: AgentEvent): ChatSnapshot | null {
  switch (event.type) {
    case 'message_start':
      /*
       * 只有 assistant 需要占位：它 start 时 content 是空的，正文全靠后续 delta 累积。
       * 其余角色（user）start 就带着完整内容，且随后必有 message_end——
       * 这里再 append 一次，就会和 message_end 的提交撞成两条一模一样的气泡。
       */
      return event.message.role === 'assistant' ? { ...state, streaming: event.message } : state
    case 'message_update':
      return {
        ...state,
        streaming: tickThinking(
          applyDelta(state.streaming, event.assistantMessageEvent),
          event.assistantMessageEvent,
        ),
      }
    case 'message_end':
      return commitMessage(state, event.message)
    default:
      return null
  }
}

/** 工具执行三态 */
function reduceTools(state: ChatSnapshot, event: AgentEvent): ChatSnapshot | null {
  switch (event.type) {
    case 'tool_execution_start':
      return upsertTool(state, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        isError: false,
        status: 'running',
      })
    case 'tool_execution_update':
      return patchTool(state, event.toolCallId, { partialResult: event.partialResult })
    case 'tool_execution_end':
      return patchTool(state, event.toolCallId, {
        result: event.result,
        isError: event.isError,
        status: 'done',
      })
    default:
      return null
  }
}

/** 队列、扩展请求与错误 */
function reduceMisc(state: ChatSnapshot, event: AgentEvent): ChatSnapshot | null {
  switch (event.type) {
    case 'queue_update':
      return { ...state, queue: { steering: event.steering, followUp: event.followUp } }
    case 'extension_error':
      return { ...state, error: { message: event.error } }
    case 'extension_ui_request':
      // 只有对话类请求需要用户回应；notify 一类发完即忘，不该挂起界面
      return isDialogRequest(event) ? { ...state, pendingDialog: event } : state
    default:
      return null
  }
}

/**
 * 按事件推进思考计时。
 *
 * 从首个 thinking 事件起表，量的是纯思考时长，不含等 API 开口的那段——
 * 那段由轮次状态行的「处理中 Ns」负责报，两处各说各的一份，才不会
 * 上下两行显示同一个数字。
 *
 * 只有 thinking_start / thinking_delta 让表继续走，其余带内容下标的事件
 * （text_* / toolcall_*，以及 thinking_end）一律停表。
 * 不指望 pi 一定发 thinking_end：少发一个事件只会让表晚一点停，
 * 而不会永远停不下来——那样界面就会一直「正在思考」下去。
 */
function tickThinking(
  streaming: ChatAssistantMessage | null,
  event: AssistantMessageEvent,
): ChatAssistantMessage | null {
  if (!streaming || !('contentIndex' in event)) return streaming

  const thinking =
    event.type === 'thinking_start' || event.type === 'thinking_delta'
      ? startThinking(streaming.thinking, Date.now())
      : stopThinking(streaming.thinking, Date.now())

  // 同一个对象说明状态没变，原样返回，免得每个 delta 都白造一个新消息对象
  return thinking === streaming.thinking ? streaming : { ...streaming, thinking }
}

/** 起表。已经在走就原样返回，否则每个 delta 都会把起点往后推，秒数永远归零 */
function startThinking(prev: ThinkingTiming | undefined, now: number): ThinkingTiming {
  if (prev && prev.startedAt !== null) return prev
  return { startedAt: now, durationMs: prev?.durationMs ?? null }
}

function upsertTool(state: ChatSnapshot, tool: ToolExecution): ChatSnapshot {
  return { ...state, tools: { ...state.tools, [tool.toolCallId]: tool } }
}

function patchTool(state: ChatSnapshot, id: string, patch: Partial<ToolExecution>): ChatSnapshot {
  const existing = state.tools[id]
  return existing ? { ...state, tools: { ...state.tools, [id]: { ...existing, ...patch } } } : state
}
