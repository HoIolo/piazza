import { create } from 'zustand'
import type { AgentEvent, AgentMessage, ExtensionUiDialog, SessionState } from '@/rpc/types'
import { reduceEvent } from './reducer'
import { emptySnapshot, type ChatError, type ChatSnapshot } from './types'

interface ChatStore extends ChatSnapshot {
  /** pi 会话状态：当前模型、思考等级等 */
  session: SessionState | null
  /** 输入框草稿。放在 store 里是因为空状态的建议卡片需要写入它 */
  draft: string

  applyEvent: (event: AgentEvent) => void
  setMessages: (messages: AgentMessage[]) => void
  /** 把用户消息先挂到界面上，不等 pi 回传 */
  echoUserMessage: (text: string) => void
  setSession: (session: SessionState) => void
  /** 传字符串即可，只有需要细节或重连提示时才给完整对象 */
  setError: (error: string | ChatError | null) => void
  setDraft: (draft: string) => void
  setSessionLoading: (loading: boolean) => void
  setPendingDialog: (dialog: ExtensionUiDialog | null) => void
  reset: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  ...emptySnapshot(),
  session: null,
  draft: '',

  applyEvent: (event) => set((state) => reduceEvent(state, event)),

  setMessages: (messages) => set({ messages }),

  echoUserMessage: (text) =>
    set((state) => ({
      messages: [
        ...state.messages,
        { role: 'user', content: text, timestamp: Date.now(), local: true },
      ],
    })),

  setSession: (session) => set({ session }),

  setError: (error) => set({ error: typeof error === 'string' ? { message: error } : error }),

  setDraft: (draft) => set({ draft }),

  setSessionLoading: (sessionLoading) => set({ sessionLoading }),

  setPendingDialog: (pendingDialog) => set({ pendingDialog }),

  // 切换会话时连同草稿一起清空，避免把上一个会话的输入带过去
  reset: () => set({ ...emptySnapshot(), draft: '' }),
}))
