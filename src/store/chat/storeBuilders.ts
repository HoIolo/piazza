import type { AgentMessage, ImageContent } from '@/rpc/types'
import type { DraftAttachment } from '@/shared/api/attachments'
import type { HydratePayload } from './store'
import type { ChatStore } from './store'
import { restoreTools } from './restoreTools'
import { emptySnapshot, wasPaused, type ChatMessage } from './types'

/** 输入框的临时状态：切换会话时要一起清掉 */
export const emptyComposer = { draft: '', attachments: [] as DraftAttachment[], stopArmed: false }

export function buildLocalEcho(
  text: string,
  images: ImageContent[],
  localId: string,
  steered = false,
): ChatMessage {
  return {
    role: 'user',
    content: images.length ? [...(text ? [{ type: 'text' as const, text }] : []), ...images] : text,
    timestamp: Date.now(),
    local: true,
    localId,
    ...(steered ? { steered: true } : {}),
  }
}

export function filterChatMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((m) => (m as { role?: string }).role !== 'system')
}

export function buildHydratedState(prev: ChatStore, payload: HydratePayload): Partial<ChatStore> {
  const state = payload.state ?? null
  const messages = filterChatMessages(payload.messages)
  return {
    ...emptySnapshot(),
    viewKey: payload.viewKey,
    session: state,
    lastModel: state ? state.model : prev.lastModel,
    lastThinkingLevel: state ? state.thinkingLevel : prev.lastThinkingLevel,
    previewName: payload.sessionName ?? null,
    messages,
    paused: wasPaused(messages),
    tools: payload.tools ?? restoreTools(messages),
    ...emptyComposer,
  }
}

/**
 * 本地乐观回显：发送那一刻先把用户消息挂上去，不等 pi 回传。
 *
 * 抽成函数是为了让 store 定义本身短一截——store 里每个 action 都是一行，
 * 只有这个要现生成 id 再写回，塞进去会把整段声明撑长。
 */
export function echoMessage(
  set: (updater: (state: ChatStore) => Partial<ChatStore>) => void,
  text: string,
  images: ImageContent[],
  steered = false,
): string {
  const localId = crypto.randomUUID()
  set((state) => ({
    messages: [...state.messages, buildLocalEcho(text, images, localId, steered)],
  }))
  return localId
}
