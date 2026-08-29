import { useCallback, useEffect, useState } from 'react'
import { rpcClient } from '@/rpc/client'
import type { AvailableModels, AvailableThinkingLevels, Model, ThinkingLevel } from '@/rpc/types'
import { useChatStore } from '@/store/chat'

interface ModelOptions {
  models: Model[]
  levels: ThinkingLevel[]
  loading: boolean
}

/**
 * 拉取可选模型与思考等级。
 *
 * 思考等级随模型而变（xhigh / max 只有部分模型支持），因此换模型后要重取；
 * 依赖当前模型 id 而非整个 session 对象，避免流式过程中的状态刷新触发无谓请求。
 */
export function useModelOptions(): ModelOptions {
  const modelId = useChatStore((s) => s.session?.model?.id ?? null)
  const [models, setModels] = useState<Model[]>([])
  const [levels, setLevels] = useState<ThinkingLevel[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const [modelData, levelData] = await Promise.all([
      rpcClient.send<AvailableModels>({ type: 'get_available_models' }),
      rpcClient.send<AvailableThinkingLevels>({ type: 'get_available_thinking_levels' }),
    ])
    return { models: modelData.models ?? [], levels: levelData.levels ?? [] }
  }, [])

  useEffect(() => {
    if (!modelId) return

    let cancelled = false
    load()
      .then((data) => {
        if (cancelled) return
        setModels(data.models)
        setLevels(data.levels)
      })
      // 取不到就退化为「只显示当前模型」，不打扰用户
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [modelId, load])

  // loading 由 loaded 派生：换模型时列表已有内容，不必再退回骨架态
  return { models, levels, loading: !loaded }
}
