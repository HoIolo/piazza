import { useEffect, useState } from 'react'
import { rpcClient } from '@/rpc/client'
import type { AvailableModels, AvailableThinkingLevels } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { useChatStore } from '@/store/chat'

export function useModelOptions() {
  const rpcReady = useChatStore((s) => s.rpcReady)
  const sessionId = useChatStore((s) => s.session?.sessionId)
  const provider = useChatStore((s) => s.session?.model?.provider)
  const model = useChatStore((s) => s.session?.model?.id)
  const key = JSON.stringify([sessionId, provider, model])
  const [loaded, setLoaded] = useState<{
    key: string
    models?: AvailableModels['models']
    levels?: AvailableThinkingLevels['levels']
    error?: string
  }>()

  useEffect(() => {
    if (!rpcReady || !sessionId) return
    let current = true
    const levels = model
      ? rpcClient
          .send<AvailableThinkingLevels>({ type: 'get_available_thinking_levels' })
          .catch(() => ({ levels: [] }))
      : Promise.resolve({ levels: [] })
    void Promise.all([
      rpcClient.send<AvailableModels>({ type: 'get_available_models' }),
      levels,
    ]).then(
      ([data, { levels }]) => {
        if (current) setLoaded({ key, models: data.models, levels })
      },
      (reason: unknown) => {
        if (current) setLoaded({ key, error: errorMessage(reason) })
      },
    )
    return () => {
      current = false
    }
  }, [rpcReady, sessionId, model, key])

  const result = loaded?.key === key ? loaded : undefined
  return {
    models: result?.models ?? [],
    levels: result?.levels ?? [],
    loading: Boolean(sessionId && !result),
    error: result?.error,
  }
}
