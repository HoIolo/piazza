import { useEffect, useState } from 'react'
import { getVisibleCommands } from '@/rpc/visibleCommands'
import type { PiCommand } from '@/rpc/types'
import { useChatStore } from '@/store/chat'

export function usePiCommands() {
  const rpcReady = useChatStore((state) => state.rpcReady)
  const sessionId = useChatStore((state) => state.session?.sessionId)
  const [result, setResult] = useState<{ sessionId: string; commands: PiCommand[] }>()
  useEffect(() => {
    if (!rpcReady || !sessionId) return
    let current = true
    const finish = (commands: PiCommand[]) => {
      if (current) setResult({ sessionId, commands })
    }
    void getVisibleCommands().then(
      (data) => finish(data?.commands ?? []),
      () => finish([]),
    )
    return () => {
      current = false
    }
  }, [rpcReady, sessionId])
  return result && result.sessionId === sessionId ? result.commands : []
}
