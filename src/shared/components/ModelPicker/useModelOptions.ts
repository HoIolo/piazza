import { useEffect, useRef, useState } from 'react'
import { rpcClient } from '@/rpc/client'
import type { AvailableModels, AvailableThinkingLevels, SessionState } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { useChatStore } from '@/store/chat'
import { isPlaceholderModel } from '@/store/chat/modelFallback'

interface ModelOptions extends AvailableModels, AvailableThinkingLevels {
  error?: string
}

export interface ModelOptionsFetcher {
  fetchModels: () => Promise<AvailableModels>
  fetchLevels: () => Promise<AvailableThinkingLevels>
}

const emptyOptions: ModelOptions = { models: [], levels: [] }
const MODEL_QUERY_TIMEOUT_MS = 10_000

const defaultFetcher: ModelOptionsFetcher = {
  fetchModels: () =>
    rpcClient.send<AvailableModels>(
      { type: 'get_available_models' },
      undefined,
      MODEL_QUERY_TIMEOUT_MS,
    ),
  fetchLevels: () =>
    rpcClient.send<AvailableThinkingLevels>(
      { type: 'get_available_thinking_levels' },
      undefined,
      MODEL_QUERY_TIMEOUT_MS,
    ),
}

function queryOptions(fetcher: ModelOptionsFetcher, hasModel: boolean): Promise<ModelOptions> {
  const levels = hasModel
    ? fetcher.fetchLevels().catch(() => ({ levels: [] }))
    : Promise.resolve({ levels: [] })
  return Promise.all([fetcher.fetchModels(), levels]).then(([data, { levels }]) => ({
    models: data.models,
    levels,
  }))
}

function optionsKey(session: SessionState | null, rpcReady: boolean): string {
  const model = session?.model
  return JSON.stringify([session?.sessionId, model?.provider, model?.id, rpcReady])
}

function resolveOptions(
  rpcReady: boolean,
  sessionLoading: boolean,
  loaded: { key: string; options: ModelOptions } | undefined,
  key: string,
) {
  if (!rpcReady) return { ...emptyOptions, loading: sessionLoading }
  const options = loaded?.key === key ? loaded.options : undefined
  return { ...(options ?? emptyOptions), loading: sessionLoading || !options }
}

export function useModelOptions(
  rpcReady: boolean,
  session: SessionState | null,
  fetcher?: ModelOptionsFetcher,
  externalLoading?: boolean,
) {
  const mainLoading = useChatStore((s) => s.sessionLoading)
  const sessionLoading = externalLoading ?? mainLoading
  const sessionId = session?.sessionId
  const hasModel = !isPlaceholderModel(session?.model)
  const key = optionsKey(session, rpcReady)
  const [loaded, setLoaded] = useState<{ key: string; options: ModelOptions }>()
  const fetcherRef = useRef<ModelOptionsFetcher>(fetcher ?? defaultFetcher)
  useEffect(() => {
    fetcherRef.current = fetcher ?? defaultFetcher
  }, [fetcher])

  useEffect(() => {
    if (!rpcReady || !sessionId) return
    let current = true
    void queryOptions(fetcherRef.current, hasModel).then(
      (options) => current && setLoaded({ key, options }),
      (reason: unknown) =>
        current && setLoaded({ key, options: { ...emptyOptions, error: errorMessage(reason) } }),
    )
    return () => {
      current = false
    }
  }, [rpcReady, sessionId, hasModel, key])

  return resolveOptions(rpcReady, sessionLoading, loaded, key)
}
