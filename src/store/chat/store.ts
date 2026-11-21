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
import { sessionMetadataPatch } from './sessionMetadata'
import { reduceEvent } from './reducer'
import { restoreTools } from './restoreTools'
import {
  emptySnapshot,
  wasPaused,
  type ChatError,
  type ChatMessage,
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

interface ChatStore extends ChatSnapshot {
  session: SessionState | null
  lastModel: Model | null
  lastThinkingLevel: ThinkingLevel | null
  draft: string
  attachments: DraftAttachment[]
  setAttachments: (attachments: DraftAttachment[]) => void
  stopArmed: boolean

  applyEvent: (event: AgentEvent) => void
  setMessages: (messages: AgentMessage[], viewKey?: string) => void
  echoUserMessage: (text: string, images?: ImageContent[]) => string
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

const emptyComposer = { draft: '', attachments: [] as DraftAttachment[], stopArmed: false }

const SWITCH_FREEZE_PATCH = {
  streaming: null,
  isStreaming: false,
  turnStartedAt: null,
  rpcReady: false,
  paused: false,
  titlePending: false,
  pendingDialog: null,
  error: null,
  ...emptyComposer,
}

function buildLocalEcho(text: string, images: ImageContent[], localId: string): ChatMessage {
  return {
    role: 'user',
    content: images.length ? [...(text ? [{ type: 'text' as const, text }] : []), ...images] : text,
    timestamp: Date.now(),
    local: true,
    localId,
  }
}

function filterChatMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((m) => (m as { role?: string }).role !== 'system')
}

function buildHydratedState(prev: ChatStore, payload: HydratePayload): Partial<ChatStore> {
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

export const useChatStore = create<ChatStore>((set) => ({
  ...emptySnapshot(),
  session: null,
  lastModel: null,
  lastThinkingLevel: null,
  ...emptyComposer,
  setAttachments: (attachments) => set({ attachments }),

  applyEvent: (event) => set((state) => sessionMetadataPatch(state.session, event) ?? reduceEvent(state, event)),
  setMessages: (rawMessages, viewKey) =>
    set((prev) => {
      const messages = filterChatMessages(rawMessages)
      return { viewKey: viewKey ?? prev.viewKey, messages, paused: wasPaused(messages), tools: restoreTools(messages) }
    }),
  echoUserMessage: (text, images = []) => {
    const localId = crypto.randomUUID()
    set((state) => ({ messages: [...state.messages, buildLocalEcho(text, images, localId)] }))
    return localId
  },
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
  beginSwitch: () => set(SWITCH_FREEZE_PATCH),
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
  reset: (viewKey = 'init') =>
    set({ ...emptySnapshot(), viewKey, session: null, ...emptyComposer }),
}))
