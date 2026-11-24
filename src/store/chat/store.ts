import { create } from 'zustand'
import type {
  AgentEvent,
  AgentMessage,
  ExtensionUiDialog,
  ImageContent,
  Model,
  SessionState,
  ThinkingLevel,
} from '@/rpc/types'
import type { DraftAttachment } from '@/shared/api/attachments'
import { clearSteers } from './pendingSteers'
import { sessionMetadataPatch } from './sessionMetadata'
import { reduceEvent } from './reducer'
import { restoreTools } from './restoreTools'
import { buildHydratedState, echoMessage, emptyComposer, filterChatMessages } from './storeBuilders'
import {
  emptySnapshot,
  wasPaused,
  type ChatError,
  type ChatSnapshot,
  type ToolExecution,
} from './types'

export interface HydratePayload {
  viewKey: string
  state?: SessionState | null
  sessionName?: string | null
  messages: AgentMessage[]
  tools?: Record<string, ToolExecution>
}

export interface ChatStore extends ChatSnapshot {
  session: SessionState | null
  lastModel: Model | null
  lastThinkingLevel: ThinkingLevel | null
  draft: string
  attachments: DraftAttachment[]
  setAttachments: (attachments: DraftAttachment[]) => void
  stopArmed: boolean

  applyEvent: (event: AgentEvent) => void
  setMessages: (messages: AgentMessage[], viewKey?: string) => void
  echoUserMessage: (text: string, images?: ImageContent[], steered?: boolean) => string
  removeLocalEcho: (id: string) => void
  setSession: (session: SessionState) => void
  setError: (error: string | ChatError | null) => void
  setDraft: (draft: string) => void
  setStopArmed: (armed: boolean) => void
  setSessionLoading: (loading: boolean) => void
  setRpcReady: (ready: boolean) => void
  beginSwitch: () => void
  hydrateSession: (payload: HydratePayload) => void
  restoreLiveSession: (payload: {
    viewKey: string
    session: SessionState | null
    snapshot: ChatSnapshot
  }) => void
  setPendingDialog: (dialog: ExtensionUiDialog | null) => void
  reset: (viewKey?: string) => void
}

/*
 * 切会话时顺带丢掉待认领的引导：它们是上一条会话里发出去的，
 * 留着只会认领到新会话里碰巧同文的提问，把普通提问错标成引导。
 */
const SWITCH_FREEZE_PATCH = {
  streaming: null,
  isStreaming: false,
  isCompacting: false,
  compactionCount: 0,
  compactedTokens: null,
  turnStartedAt: null,
  rpcReady: false,
  paused: false,
  titlePending: false,
  pendingDialog: null,
  error: null,
  ...emptyComposer,
}

/** 切走当前会话：丢掉待认领的引导，再冻结上一轮的运行态 */
function switchAway(set: (patch: Partial<ChatStore>) => void): void {
  clearSteers()
  set(SWITCH_FREEZE_PATCH)
}

export const useChatStore = create<ChatStore>((set) => ({
  ...emptySnapshot(),
  session: null,
  lastModel: null,
  lastThinkingLevel: null,
  ...emptyComposer,
  setAttachments: (attachments) => set({ attachments }),

  applyEvent: (event) =>
    set((state) => sessionMetadataPatch(state.session, event) ?? reduceEvent(state, event)),
  setMessages: (rawMessages, viewKey) =>
    set((prev) => {
      const messages = filterChatMessages(rawMessages)
      return {
        viewKey: viewKey ?? prev.viewKey,
        messages,
        paused: wasPaused(messages),
        tools: restoreTools(messages),
      }
    }),
  echoUserMessage: (text, images = [], steered = false) => echoMessage(set, text, images, steered),
  removeLocalEcho: (id) =>
    set((state) => ({ messages: state.messages.filter((m) => m.localId !== id) })),
  setSession: (session) =>
    set((s) => ({
      session,
      lastModel: session.model ?? s.lastModel,
      lastThinkingLevel: session.thinkingLevel ?? s.lastThinkingLevel,
    })),
  setError: (error) => set({ error: typeof error === 'string' ? { message: error } : error }),
  setDraft: (draft) => set({ draft }),
  setStopArmed: (stopArmed) => set({ stopArmed }),
  setSessionLoading: (sessionLoading) => set({ sessionLoading }),
  setRpcReady: (rpcReady) => set({ rpcReady }),
  beginSwitch: () => switchAway(set),
  hydrateSession: (payload) => set((prev) => buildHydratedState(prev, payload)),
  restoreLiveSession: ({ viewKey, session, snapshot }) =>
    set((prev) => ({
      ...snapshot,
      viewKey,
      session,
      lastModel: session?.model ?? prev.lastModel,
      lastThinkingLevel: session?.thinkingLevel ?? prev.lastThinkingLevel,
      ...emptyComposer,
    })),
  setPendingDialog: (pendingDialog) => set({ pendingDialog }),
  reset: (viewKey = 'init') => {
    clearSteers()
    set({ ...emptySnapshot(), viewKey, session: null, ...emptyComposer })
  },
}))
