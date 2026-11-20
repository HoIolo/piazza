import { useEffect, useState } from 'react'
import { rpcClient } from '@/rpc/client'
import type { CommandsData, PiCommand } from '@/rpc/types'
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
    void rpcClient.send<CommandsData>({ type: 'get_commands' }).then(
      (data) => finish(data?.commands ?? []),
      () => finish([]),
    )
    return () => {
      current = false
    }
  }, [rpcReady, sessionId])
  return result && result.sessionId === sessionId ? result.commands : []
}
