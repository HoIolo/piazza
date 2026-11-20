import { useEffect, useRef } from 'react'
import { rpcClient } from '@/rpc/client'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'
import { bootSession, describeExit, markRpcProcessExited, startWatchdog } from './bootSession'
import { useChatStore } from './store'
import {
  commitLoadedSession,
  prepareSwitchView,
  snapshotCurrentSession,
  startSkeletonGuard,
  tryHydrateDisk,
} from './switchHelpers'

function useAgentEvents(): void {
  const applyEvent = useChatStore((s) => s.applyEvent)
  useEffect(() => {
    const offEvent = rpcClient.onEvent((event) => {
      const store = useChatStore.getState()
      if (!store.rpcReady || !store.session) return
      store.applyEvent(event)
      if (event.type === 'message_end' && event.message.role === 'user') {
        void useProjectsStore.getState().refresh()
      }
      if (event.type === 'agent_settled') {
        snapshotCurrentSession()
        void useProjectsStore.getState().refresh()
      }
    })
    const offExit = rpcClient.onExit((info) => {
      markRpcProcessExited()
      const store = useChatStore.getState()
      store.setRpcReady(false)
      store.setError(describeExit(info))
    })
    return () => {
      offEvent()
      offExit()
    }
  }, [applyEvent])
}

function runSessionSwitch(cwd: string, sessionPath: string | null, viewKey: string, forceCold: boolean) {
  let cancelled = false
  const isCancelled = () => cancelled
  const store = useChatStore.getState()
  const previous = store.session
  const wasStreaming = store.isStreaming

  snapshotCurrentSession()
  const hitCache = prepareSwitchView(sessionPath, viewKey)
  const skeletonTimer = startSkeletonGuard(viewKey, hitCache, isCancelled)
  if (!hitCache) {
    void tryHydrateDisk(sessionPath, viewKey, isCancelled).finally(() => clearTimeout(skeletonTimer))
  }
  const watchdog = startWatchdog(isCancelled, (err) => {
    const s = useChatStore.getState()
    s.setSessionLoading(false)
    s.setError(err)
  })

  void bootSession({
    cwd,
    sessionPath,
    current: () => !cancelled,
    previous,
    wasStreaming,
    forceCold,
  })
    .then((loaded) => {
      if (!cancelled && loaded) commitLoadedSession(viewKey, loaded)
      if (wasStreaming) void useProjectsStore.getState().refresh()
    })
    .catch((e: unknown) => {
      if (!cancelled) useChatStore.getState().setError(errorMessage(e))
    })
    .finally(() => {
      clearTimeout(skeletonTimer)
      clearTimeout(watchdog)
      if (!cancelled) useChatStore.getState().setSessionLoading(false)
    })

  return () => {
    cancelled = true
    clearTimeout(skeletonTimer)
    clearTimeout(watchdog)
  }
}

export function useAgentSession(): void {
  const cwd = useAppStore((s) => s.currentCwd)
  const sessionPath = useAppStore((s) => s.currentSessionPath)
  const sessionNonce = useAppStore((s) => s.sessionNonce)
  const reconnectNonce = useAppStore((s) => s.reconnectNonce)
  const applyEvent = useChatStore((s) => s.applyEvent)
  const lastReconnectRef = useRef(reconnectNonce)

  useAgentEvents()

  useEffect(() => {
    if (!cwd) return
    const store = useChatStore.getState()
    const targetPath = sessionPath ?? (store.rpcReady ? null : useAppStore.getState().liveSessionPath)
    const forceCold = reconnectNonce !== lastReconnectRef.current || Boolean(store.error?.fatal)
    lastReconnectRef.current = reconnectNonce
    const viewKey = targetPath ?? `new:${sessionNonce}`
    return runSessionSwitch(cwd, targetPath, viewKey, forceCold)
  }, [cwd, sessionPath, sessionNonce, reconnectNonce, applyEvent])
}
