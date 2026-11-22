import { useCallback } from 'react'
import { rpcClient } from '@/rpc/client'
import type {
  ForkMessage,
  ForkMessagesData,
  ForkResult,
  ImageContent,
  MessagesData,
  SessionState,
  StreamingBehavior,
} from '@/rpc/types'
import { truncateSessionBefore } from '@/shared/api/sessions'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'
import { evictCachedSession, putCachedSession } from './sessionCache'
import { dispatchPrompt, resumeTurn } from './sendPrompt'
import { stopNow } from './stopConfirm'
import { useChatStore } from './store'

function resolveForkEntry(
  forkMessages: ForkMessage[],
  userIndex: number | undefined,
  rawText: string,
): ForkMessage | undefined {
  const trimmed = rawText.trim()
  if (userIndex != null && forkMessages[userIndex]?.text.trim() === trimmed) {
    return forkMessages[userIndex]
  }
  return (
    forkMessages.find((item) => item.text.trim() === trimmed) ??
    (userIndex != null ? forkMessages[userIndex] : undefined)
  )
}

async function syncForkedSession(): Promise<void> {
  const [state, messagesData] = await Promise.all([
    rpcClient.send<SessionState>({ type: 'get_state' }),
    rpcClient.send<MessagesData>({ type: 'get_messages' }),
  ])
  const store = useChatStore.getState()
  const file = state.sessionFile ?? null
  store.setSession(state)
  store.setMessages(messagesData.messages ?? [], file ?? undefined)
  useAppStore.getState().setLiveSession(file)
  if (file) {
    evictCachedSession(file)
    const next = useChatStore.getState()
    putCachedSession(file, {
      state,
      sessionName: state.sessionName ?? null,
      messages: next.messages,
      tools: next.tools,
    })
  }
  void useProjectsStore.getState().refresh()
}

async function rewindBeforeEntry(entryId: string): Promise<boolean> {
  const sessionFile = useChatStore.getState().session?.sessionFile
  if (sessionFile) {
    await truncateSessionBefore(sessionFile, entryId)
    evictCachedSession(sessionFile)
    const switched = await rpcClient.send<{ cancelled?: boolean }>({
      type: 'switch_session',
      sessionPath: sessionFile,
    })
    return !switched?.cancelled
  }
  const forked = await rpcClient.send<ForkResult>({ type: 'fork', entryId })
  return !forked.cancelled
}

/**
 * 原地编辑用户消息并重发：截断当前会话文件至目标消息之前并重载同一文件，
 * 避免 pi 的 fork 命令额外派生一条新会话；分叉建新会话仍由「从此分支」按钮负责。
 */
async function editAndResend(
  userIndex: number | undefined,
  rawText: string,
  nextMessage: string,
  images: ImageContent[],
): Promise<boolean> {
  if (useChatStore.getState().isStreaming) return false
  try {
    const { messages } = await rpcClient.send<ForkMessagesData>({ type: 'get_fork_messages' })
    const target = resolveForkEntry(messages ?? [], userIndex, rawText)
    if (!target) {
      useChatStore.getState().setError('无法定位该条用户消息对应的会话节点')
      return false
    }
    const ok = await rewindBeforeEntry(target.entryId)
    if (!ok) return false
    await syncForkedSession()
    return await dispatchPrompt(nextMessage, 'steer', images)
  } catch (error) {
    useChatStore.getState().setError(errorMessage(error))
    return false
  }
}

/**
 * 从某轮助手回复末尾分叉出一条新会话（对齐 Codex 的 Fork 行为）：
 * - 若后续还有下一轮用户提问，则在下一轮提问之前分叉（保留至本轮回复结尾）；
 * - 若本轮已是最后一轮，则直接 clone 当前完整分支到新会话。
 */
async function forkAfterTurn(userIndex: number | undefined): Promise<boolean> {
  if (useChatStore.getState().isStreaming) return false
  try {
    const { messages } = await rpcClient.send<ForkMessagesData>({ type: 'get_fork_messages' })
    const list = messages ?? []
    const nextUser = userIndex != null ? list[userIndex + 1] : undefined
    const res = nextUser
      ? await rpcClient.send<ForkResult>({ type: 'fork', entryId: nextUser.entryId })
      : await rpcClient.send<{ cancelled?: boolean }>({ type: 'clone' })
    if (res?.cancelled) return false
    await syncForkedSession()
    return true
  } catch (error) {
    useChatStore.getState().setError(errorMessage(error))
    return false
  }
}

/** 对话流操作：发送、编辑分叉重发、从助手回复分叉、排队与中断 */
export function useChatActions() {
  const isStreaming = useChatStore((s) => s.isStreaming)
  const sendPrompt = useCallback(
    (message: string, behavior: StreamingBehavior = 'steer', images: ImageContent[] = []) =>
      dispatchPrompt(message, behavior, images),
    [],
  )
  const editUserMessage = useCallback(
    (
      userIndex: number | undefined,
      rawText: string,
      nextMessage: string,
      images: ImageContent[] = [],
    ) => editAndResend(userIndex, rawText, nextMessage, images),
    [],
  )
  const forkFromTurn = useCallback((userIndex?: number) => forkAfterTurn(userIndex), [])
  return {
    sendPrompt,
    editUserMessage,
    forkFromTurn,
    abort: stopNow,
    resume: resumeTurn,
    isStreaming,
  }
}
