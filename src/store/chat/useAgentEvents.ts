import { useEffect } from 'react'
import { rpcClient } from '@/rpc/client'
import { useProjectsStore } from '@/store/projects.store'
import { markRpcProcessExited, describeExit } from './bootSession'
import { applyBackgroundEvent, handleBackgroundExit } from './sessionPool'
import { useChatStore } from './store'
import { snapshotCurrentSession } from './switchHelpers'

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
      useChatStore.setState({ titlePending: false })
      store.setRpcReady(false)
      store.setError(describeExit(info))
    })
    return () => {
      offEvent()
      offExit()
    }
  }, [applyEvent])
}
