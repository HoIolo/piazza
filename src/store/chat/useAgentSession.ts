import { useEffect, useRef } from 'react'
import { rpcClient } from '@/rpc/client'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { bootSession, getSlotCwd, markRpcProcessExited, startWatchdog } from './bootSession'
import { detachForeground, reattachBackground } from './sessionPool'
import { hasPendingWork } from './types'
import { useAgentEvents } from './useAgentEvents'
import { useChatStore } from './store'
import {
  commitLoadedSession,
  prepareSwitchView,
  snapshotCurrentSession,
  startSkeletonGuard,
  tryHydrateDisk,
} from './switchHelpers'

/** 切走时保留流式会话到后台；若目标会话已在后台运行则直接接回前台，返回 null 表示无需重启。 */
function resolveSlotForSwitch(
  cwd: string,
  sessionPath: string | null,
  viewKey: string,
  forceCold: boolean,
): string | null {
  const store = useChatStore.getState()
  const prevSlot = rpcClient.getActiveSlot()
  const shouldDetach = !forceCold && hasPendingWork(store)

  if (shouldDetach) {
    detachForeground(prevSlot, getSlotCwd(prevSlot) ?? cwd, store)
  } else {
    snapshotCurrentSession()
  }

  const bg = !forceCold ? reattachBackground(sessionPath, viewKey) : null
  if (bg) {
    if (!shouldDetach && prevSlot !== bg.slotId) {
      markRpcProcessExited(prevSlot)
      void rpcClient.stop(prevSlot).catch(() => undefined)
    }
    rpcClient.setActiveSlot(bg.slotId)
    store.restoreLiveSession({ viewKey, session: bg.session, snapshot: bg.snapshot })
    useAppStore.getState().setLiveSession(bg.sessionFile ?? sessionPath)
    return null
  }

  if (shouldDetach) {
    const nextSlot = crypto.randomUUID()
    rpcClient.setActiveSlot(nextSlot)
    return nextSlot
  }
  return prevSlot
}

function runSessionSwitch(
  cwd: string,
  sessionPath: string | null,
  viewKey: string,
  forceCold: boolean,
  reconnect: boolean,
) {
  const previous = useChatStore.getState().session
  const slotId = resolveSlotForSwitch(cwd, sessionPath, viewKey, forceCold)
  if (!slotId) return () => undefined

  let cancelled = false
  const isCancelled = () => cancelled
  if (reconnect) useChatStore.getState().setRpcReady(false)
  const hitCache = reconnect || prepareSwitchView(sessionPath, viewKey)
  const skeletonTimer = startSkeletonGuard(viewKey, hitCache, isCancelled)
  if (!hitCache) {
    void tryHydrateDisk(sessionPath, viewKey, isCancelled).finally(() =>
      clearTimeout(skeletonTimer),
    )
  }
  const watchdog = startWatchdog(isCancelled, (err) => {
    const s = useChatStore.getState()
    s.setSessionLoading(false)
    s.setError(err)
  })

  void bootSession({ slotId, cwd, sessionPath, current: () => !cancelled, previous, forceCold })
    .then((loaded) => {
      if (!cancelled && loaded) commitLoadedSession(viewKey, loaded)
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
  const lastReconnectRef = useRef(reconnectNonce)

  useAgentEvents()

  useEffect(() => {
    if (!cwd) return
    const store = useChatStore.getState()
    const reconnect = reconnectNonce !== lastReconnectRef.current
    const targetPath = reconnect
      ? (useAppStore.getState().liveSessionPath ?? sessionPath)
      : (sessionPath ?? (store.rpcReady ? null : useAppStore.getState().liveSessionPath))
    const forceCold = reconnect || Boolean(store.error?.fatal)
    lastReconnectRef.current = reconnectNonce
    const viewKey = reconnect ? store.viewKey : (targetPath ?? `new:${sessionNonce}`)
    return runSessionSwitch(cwd, targetPath, viewKey, forceCold, reconnect)
  }, [cwd, sessionPath, sessionNonce, reconnectNonce])
}
