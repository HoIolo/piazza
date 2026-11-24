import { useEffect } from 'react'
import { rpcClient } from '@/rpc/client'
import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'
import { markRpcProcessExited, describeExit } from './bootSession'
import { applyBackgroundEvent, handleBackgroundExit } from './sessionPool'
import { useChatStore } from './store'
import { snapshotCurrentSession } from './switchHelpers'

const AUTO_RECOVER_WINDOW_MS = 30_000
const AUTO_RECOVER_MAX = 2
let recoverStamps: number[] = []

function canAutoRecover(): boolean {
  const now = Date.now()
  recoverStamps = recoverStamps.filter((t) => now - t < AUTO_RECOVER_WINDOW_MS)
  if (recoverStamps.length >= AUTO_RECOVER_MAX) return false
  recoverStamps.push(now)
  return true
}

/** RPC 事件与进程退出的接线。单独成文件，主 hook 才守得住行数上限 */
export function useAgentEvents(): void {
  const applyEvent = useChatStore((s) => s.applyEvent)
  useEffect(() => {
    const offEvent = rpcClient.onEvent((event, slotId) => {
      if (slotId !== rpcClient.getActiveSlot()) {
        applyBackgroundEvent(slotId, event)
        return
      }
      const store = useChatStore.getState()
      if (!store.rpcReady || !store.session) return
      store.applyEvent(event)
      if (event.type === 'message_end' && event.message.role === 'user') {
        void useProjectsStore.getState().refresh()
      }
      if (event.type === 'agent_settled' || event.type === 'session_info_changed') {
        snapshotCurrentSession()
        void useProjectsStore.getState().refresh()
      }
    })
    const offExit = rpcClient.onExit((info, slotId) => {
      markRpcProcessExited(slotId)
      if (slotId !== rpcClient.getActiveSlot()) {
        handleBackgroundExit(slotId)
        return
      }
      const store = useChatStore.getState()
      const wasBusy = store.isStreaming || store.isCompacting
      useChatStore.setState({ titlePending: false })
      store.setRpcReady(false)
      const app = useAppStore.getState()
      // 空闲状态下后台进程意外退出时静默拉起新进程，避免无端弹错并锁死模型选择器
      if (!wasBusy && app.currentCwd && canAutoRecover()) {
        app.reconnectSession()
        return
      }
      store.setError(describeExit(info))
    })
    return () => {
      offEvent()
      offExit()
    }
  }, [applyEvent])
}
