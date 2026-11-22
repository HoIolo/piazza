import { useEffect, useState } from 'react'
import { rpcClient } from '@/rpc/client'
import type { AvailableModels, AvailableThinkingLevels, SessionState } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { useChatStore } from '@/store/chat'
import { isPlaceholderModel } from '@/store/chat/modelFallback'

interface ModelOptions extends AvailableModels, AvailableThinkingLevels {
  error?: string
}

const emptyOptions: ModelOptions = { models: [], levels: [] }

export function useModelOptions(rpcReady: boolean, session: SessionState | null) {
  const sessionLoading = useChatStore((s) => s.sessionLoading)
  const sessionId = session?.sessionId
  const model = session?.model
  const hasModel = !isPlaceholderModel(model)
  const key = JSON.stringify([sessionId, model?.provider, model?.id])
  const [loaded, setLoaded] = useState<{ key: string; options: ModelOptions }>()

  useEffect(() => {
    if (!rpcReady || !sessionId) return
    let current = true
    const levels = hasModel
      ? rpcClient
          .send<AvailableThinkingLevels>({ type: 'get_available_thinking_levels' })
          .catch(() => ({ levels: [] }))
      : Promise.resolve({ levels: [] })
    void Promise.all([
      rpcClient.send<AvailableModels>({ type: 'get_available_models' }),
      levels,
    ]).then(
      ([data, { levels }]) => {
        if (current) setLoaded({ key, options: { models: data.models, levels } })
      },
      (reason: unknown) => {
        if (current) setLoaded({ key, options: { ...emptyOptions, error: errorMessage(reason) } })
      },
    )
    return () => {
      current = false
    }
  }, [rpcReady, sessionId, hasModel, key])

  if (!rpcReady) return { ...emptyOptions, loading: sessionLoading }
  const options = loaded?.key === key ? loaded.options : undefined
  return {
    ...(options ?? emptyOptions),
    loading: sessionLoading || !options,
  }
}
