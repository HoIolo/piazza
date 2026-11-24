import { rpcClient } from '@/rpc/client'
import type { ForkMessage, ForkMessagesData, ForkResult, Model, ThinkingLevel } from '@/rpc/types'
import { truncateSessionBefore } from '@/shared/api/sessions'
import { syncCompactionForModel } from './contextWindow'
import { isPlaceholderModel } from './modelFallback'
import { evictCachedSession } from './sessionCache'
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

async function restoreSelectedModel(
  model: Model | null | undefined,
  thinkingLevel: ThinkingLevel | null | undefined,
): Promise<void> {
  if (model && !isPlaceholderModel(model)) {
    await rpcClient
      .send({ type: 'set_model', provider: model.provider, modelId: model.id })
      .catch(() => undefined)
    void syncCompactionForModel(model.provider, model.id)
  }
  if (thinkingLevel) {
    await rpcClient.send({ type: 'set_thinking_level', level: thinkingLevel }).catch(() => undefined)
  }
}

/** 兼容外部非内置 pi 二进制的慢路径回退：截断文件并 switch_session，再恢复模型 */
export async function legacyRewindBefore(
  userIndex: number | undefined,
  rawText: string,
  model: Model | null | undefined,
  thinkingLevel: ThinkingLevel | null | undefined,
  syncSession: () => Promise<void>,
): Promise<boolean> {
  const { messages } = await rpcClient.send<ForkMessagesData>({ type: 'get_fork_messages' })
  const target = resolveForkEntry(messages ?? [], userIndex, rawText)
  if (!target) {
    useChatStore.getState().setError('无法定位该条用户消息对应的会话节点')
    return false
  }
  const sessionFile = useChatStore.getState().session?.sessionFile
  if (sessionFile) {
    await truncateSessionBefore(sessionFile, target.entryId)
    evictCachedSession(sessionFile)
    const switched = await rpcClient.send<{ cancelled?: boolean }>({
      type: 'switch_session',
      sessionPath: sessionFile,
    })
    if (switched?.cancelled) return false
  } else {
    const forked = await rpcClient.send<ForkResult>({ type: 'fork', entryId: target.entryId })
    if (forked.cancelled) return false
  }
  await restoreSelectedModel(model, thinkingLevel)
  await syncSession()
  return true
}
