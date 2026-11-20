import { useEffect, useState } from 'react'
import { sideRpcClient } from '@/rpc/client'
import type { AgentEvent, ExtensionUiResponse, RpcCommand } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { reduceEvent } from '@/store/chat/reducer'
import { useChatStore } from '@/store/chat/store'
import { emptySnapshot } from '@/store/chat/types'

type SideStatus = 'starting' | 'ready' | 'disconnected'

// 严格模式、重开标签和切换项目都可能交错。上一次停完再启动下一次。
let lifecycle = Promise.resolve()

function enqueue(work: () => Promise<void>) {
  lifecycle = lifecycle.then(work).catch((reason: unknown) => {
    console.error('侧边聊天进程操作失败', reason)
  })
}

function connect(
  cwd: string,
  onEvent: (event: AgentEvent) => void,
  onStatus: (status: SideStatus, error?: string) => void,
) {
  let cancelled = false
  let exited = false
  let unsubscribe: (() => void) | undefined

  enqueue(async () => {
    if (cancelled) return
    const offEvent = sideRpcClient.onEvent(onEvent)
    const offExit = sideRpcClient.onExit((info) => {
      exited = true
      onStatus('disconnected', info.stderr.trim() || '侧边聊天进程已退出')
    })
    unsubscribe = () => {
      offEvent()
      offExit()
    }

    const fail = (reason: unknown) => {
      if (!cancelled && !exited) onStatus('disconnected', errorMessage(reason))
    }
    const model = useChatStore.getState().session?.model
    try {
      await sideRpcClient.start({
        cwd,
        provider: model?.provider,
        model: model?.id,
        ephemeral: true,
      })
      if (cancelled || exited) return
      // 确认可接收命令。关闭标签时 stop 会结束这次等待。
      void sideRpcClient.send({ type: 'get_state' }).then(() => {
        if (!cancelled && !exited) onStatus('ready')
      }, fail)
    } catch (reason) {
      fail(reason)
    }
  })

  return () => {
    cancelled = true
    if (!unsubscribe) return
    unsubscribe()
    enqueue(() => sideRpcClient.stop())
  }
}

export function useSideChatSession(cwd: string) {
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [status, setStatus] = useState<SideStatus>('starting')
  const [error, setError] = useState('')

  useEffect(
    () =>
      connect(
        cwd,
        (event) => setSnapshot((s) => reduceEvent(s, event)),
        (status, error = '') => {
          setStatus(status)
          setError(error)
        },
      ),
    [cwd],
  )

  async function send(command: RpcCommand): Promise<boolean> {
    setError('')
    try {
      await sideRpcClient.send(command)
      return true
    } catch (reason) {
      setError(errorMessage(reason))
      return false
    }
  }

  async function answer(id: string, payload: Omit<ExtensionUiResponse, 'type' | 'id'>) {
    setError('')
    try {
      await sideRpcClient.notify({ type: 'extension_ui_response', id, ...payload })
      setSnapshot((s) => (s.pendingDialog?.id === id ? { ...s, pendingDialog: null } : s))
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  return { snapshot, status, error: error || snapshot.error?.message, send, answer }
}
