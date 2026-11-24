import { rpcClient } from '@/rpc/client'
import type {
  AgentMessage,
  ForkMessage,
  ForkMessagesData,
  ForkResult,
  ImageContent,
  MessagesData,
  Model,
  RewindBeforeResult,
  SessionState,
  ThinkingLevel,
} from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'
import { legacyRewindBefore } from './editFallback'
import { evictCachedSession, putCachedSession } from './sessionCache'
import { dispatchPrompt } from './sendPrompt'
import { useChatStore } from './store'

function isUnknownCommand(error: unknown): boolean {
  return /unknown command/i.test(errorMessage(error))
}

function updateSessionCache(state: SessionState | null, file: string | null): void {
  if (!file || !state) return
  evictCachedSession(file)
  const next = useChatStore.getState()
  putCachedSession(file, {
    state,
    sessionName: state.sessionName ?? null,
    messages: next.messages,
    tools: next.tools,
  })
}

async function syncForkedSession(refreshSidebar: boolean): Promise<void> {
  const [state, messagesData] = await Promise.all([
    rpcClient.send<SessionState>({ type: 'get_state' }),
    rpcClient.send<MessagesData>({ type: 'get_messages' }),
  ])
  const store = useChatStore.getState()
  const file = state.sessionFile ?? null
  store.setSession(state)
  store.setMessages(messagesData.messages ?? [], file ?? undefined)
  useAppStore.getState().setLiveSession(file)
  updateSessionCache(state, file)
  if (refreshSidebar) void useProjectsStore.getState().refresh()
}

function applyFastRewind(messages: AgentMessage[], sessionFile: string | null): void {
  const store = useChatStore.getState()
  const file = sessionFile ?? store.session?.sessionFile ?? null
  store.setMessages(messages, file ?? undefined)
  updateSessionCache(store.session, file)
}

async function rewindForEdit(
  userIndex: number | undefined,
  rawText: string,
  model: Model | null | undefined,
  thinkingLevel: ThinkingLevel | null | undefined,
): Promise<boolean> {
  try {
    const res = await rpcClient.send<RewindBeforeResult>({
      type: 'rewind_before',
      userIndex,
      rawText,
    })
    if (res.cancelled) return false
    applyFastRewind(res.messages ?? [], res.sessionFile ?? null)
    return true
  } catch (error) {
    if (!isUnknownCommand(error)) throw error
    return legacyRewindBefore(userIndex, rawText, model, thinkingLevel, () => syncForkedSession(false))
  }
}

/**
 * 原地编辑用户消息并重发：优先走 worker 内置的 `rewind_before` 内存回退（~1ms，
 * 不重建扩展与 MCP，不触发 Windows 文件重写扫描），并保留当前选中的模型与推理强度。
 */
export async function editAndResend(
  userIndex: number | undefined,
  rawText: string,
  nextMessage: string,
  images: ImageContent[],
  onCommitted?: () => void,
): Promise<boolean> {
  const before = useChatStore.getState()
  if (before.isStreaming) return false
  const selectedModel = before.session?.model ?? before.lastModel
  const selectedThinking = before.session?.thinkingLevel ?? before.lastThinkingLevel
  try {
    const ok = await rewindForEdit(userIndex, rawText, selectedModel, selectedThinking)
    if (!ok) return false
    onCommitted?.()
    return await dispatchPrompt(nextMessage, 'steer', images)
  } catch (error) {
    useChatStore.getState().setError(errorMessage(error))
    return false
  }
}

async function fetchBranchForkMessages(): Promise<ForkMessage[]> {
  try {
    const data = await rpcClient.send<ForkMessagesData>({ type: 'get_branch_fork_messages' })
    return data.messages ?? []
  } catch (error) {
    if (!isUnknownCommand(error)) throw error
    const data = await rpcClient.send<ForkMessagesData>({ type: 'get_fork_messages' })
    return data.messages ?? []
  }
}

/** 从某轮助手回复末尾分叉出一条新会话（对齐 Codex 的 Fork 行为） */
export async function forkAfterTurn(userIndex: number | undefined): Promise<boolean> {
  if (useChatStore.getState().isStreaming) return false
  try {
    const list = await fetchBranchForkMessages()
    const nextUser = userIndex != null ? list[userIndex + 1] : undefined
    const res = nextUser
      ? await rpcClient.send<ForkResult>({ type: 'fork', entryId: nextUser.entryId })
      : await rpcClient.send<{ cancelled?: boolean }>({ type: 'clone' })
    if (res?.cancelled) return false
    await syncForkedSession(true)
    return true
  } catch (error) {
    useChatStore.getState().setError(errorMessage(error))
    return false
  }
}
