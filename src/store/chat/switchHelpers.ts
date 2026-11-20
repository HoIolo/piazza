import type { AgentMessage, SessionState } from '@/rpc/types'
import { readSessionSnapshot } from '@/shared/api/sessions'
import { useAppStore } from '@/store/app.store'
import { getCachedSession, messagesEquivalent, putCachedSession } from './sessionCache'
import { useChatStore } from './store'

const SKELETON_DELAY_MS = 120

function resolveCacheKey(viewKey: string, sessionFile?: string): string | null {
  if (sessionFile) return sessionFile
  return viewKey.startsWith('new:') || viewKey === 'init' ? null : viewKey
}

export function snapshotCurrentSession(): void {
  const s = useChatStore.getState()
  const file = resolveCacheKey(s.viewKey, s.session?.sessionFile)
  if (!file || s.isStreaming || s.streaming || s.messages.length === 0) return
  putCachedSession(file, {
    state: s.session,
    sessionName: s.session?.sessionName ?? s.previewName,
    messages: s.messages,
    tools: s.tools,
  })
}

export function prepareSwitchView(sessionPath: string | null, viewKey: string): boolean {
  const store = useChatStore.getState()
  if (!sessionPath) {
    store.reset(viewKey)
    useAppStore.getState().setLiveSession(null)
    return true
  }
  const cached = getCachedSession(sessionPath)
  if (cached) {
    store.hydrateSession({ viewKey, ...cached })
    useAppStore.getState().setLiveSession(sessionPath)
    return true
  }
  store.beginSwitch()
  useAppStore.getState().setLiveSession(null)
  return false
}

export async function tryHydrateDisk(
  sessionPath: string | null,
  viewKey: string,
  isCancelled: () => boolean,
): Promise<boolean> {
  if (!sessionPath) return false
  try {
    const snap = await readSessionSnapshot(sessionPath)
    if (isCancelled() || !snap || snap.messages.length === 0) return false
    const cur = useChatStore.getState()
    if (!cur.rpcReady) {
      cur.hydrateSession({ viewKey, sessionName: snap.sessionName, messages: snap.messages })
      const next = useChatStore.getState()
      putCachedSession(sessionPath, {
        state: next.session,
        sessionName: snap.sessionName,
        messages: next.messages,
        tools: next.tools,
      })
    }
    return true
  } catch {
    return false
  }
}

export function commitLoadedSession(
  viewKey: string,
  loaded: { state: SessionState; messages: AgentMessage[] | null },
): void {
  const store = useChatStore.getState()
  store.setSession(loaded.state)
  if (
    loaded.messages &&
    (!messagesEquivalent(store.messages, loaded.messages) || store.viewKey !== viewKey)
  ) {
    store.setMessages(loaded.messages, viewKey)
  }
  store.setSessionLoading(false)
  store.setRpcReady(true)
  store.setError(null)
  useAppStore.getState().setLiveSession(loaded.state.sessionFile ?? null)
  const file = loaded.state.sessionFile
  if (file) {
    const next = useChatStore.getState()
    putCachedSession(file, {
      state: loaded.state,
      sessionName: loaded.state.sessionName ?? null,
      messages: next.messages,
      tools: next.tools,
    })
  }
}

export function startSkeletonGuard(
  viewKey: string,
  hitCache: boolean,
  isCancelled: () => boolean,
): ReturnType<typeof setTimeout> | undefined {
  if (hitCache) return undefined
  return setTimeout(() => {
    const cur = useChatStore.getState()
    if (!isCancelled() && cur.viewKey !== viewKey) {
      cur.reset(viewKey)
      cur.setSessionLoading(true)
    }
  }, SKELETON_DELAY_MS)
}
