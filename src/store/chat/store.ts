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
import { reduceEvent } from './reducer'
import { restoreTools } from './restoreTools'
import {
  emptySnapshot,
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
  setPendingDialog: (dialog: ExtensionUiDialog | null) => void
  reset: (viewKey?: string) => void
}

const SWITCH_FREEZE_PATCH = {
  streaming: null,
  isStreaming: false,
  turnStartedAt: null,
  rpcReady: false,
  pendingDialog: null,
  error: null,
  draft: '',
  attachments: [] as DraftAttachment[],
  stopArmed: false,
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

function buildHydratedState(prev: ChatStore, payload: HydratePayload): Partial<ChatStore> {
  const state = payload.state ?? null
  const messages = payload.messages
  return {
    ...emptySnapshot(),
    viewKey: payload.viewKey,
    session: state,
    lastModel: state ? state.model : prev.lastModel,
    lastThinkingLevel: state ? state.thinkingLevel : prev.lastThinkingLevel,
    previewName: payload.sessionName ?? null,
    messages,
    tools: payload.tools ?? restoreTools(messages),
    draft: '',
    attachments: [],
    stopArmed: false,
  }
}

export const useChatStore = create<ChatStore>((set) => ({
  ...emptySnapshot(),
  session: null,
  lastModel: null,
  lastThinkingLevel: null,
  draft: '',
  attachments: [],
  setAttachments: (attachments) => set({ attachments }),
  stopArmed: false,

  applyEvent: (event) => set((state) => reduceEvent(state, event)),
  setMessages: (messages, viewKey) =>
    set((prev) => ({ viewKey: viewKey ?? prev.viewKey, messages, tools: restoreTools(messages) })),
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
  setPendingDialog: (pendingDialog) => set({ pendingDialog }),
  reset: (viewKey = 'init') =>
    set({ ...emptySnapshot(), viewKey, session: null, draft: '', attachments: [], stopArmed: false }),
}))
