import { refreshRuntimeAfterSave } from '@/store/chat/refreshRuntime'
import { useCallback, useEffect, useState } from 'react'
import { readModelsConfig, writeModelsConfig, type ModelsConfig } from '@/shared/api/config'
import { errorMessage } from '@/shared/utils/error'
import type { ProviderMap } from './providerOps'

export interface ModelsConfigApi {
  providers: ProviderMap
  loading: boolean
  /** 读取失败的原因；写入失败由 commit 抛给调用方，各自就地提示 */
  error: string | null
  /** 最近一次 commit 是否成功落盘 */
  saved: boolean
  /** 改写 providers 并立即写入 models.json。失败时抛错、本地状态不变 */
  commit: (transform: (providers: ProviderMap) => ProviderMap) => Promise<void>
}

/** providers 缺省时补空对象，后续操作就不必反复判空 */
function normalize(config: ModelsConfig): ModelsConfig {
  return { providers: {}, ...config }
}

/**
 * 编辑 <agent>/models.json 的 provider 与 model。
 *
 * 不走「草稿 + 页面级保存」那套：这一页的每次改动都在一个对话框里完成，
 * 对话框按下「保存」就是一次完整的事务，直接落盘最省事，也不会留下
 * 「改了半天忘了点保存」的坑。settings.json 那页字段零散，才需要草稿。
 */
export function useModelsConfig(): ModelsConfigApi {
  const [config, setConfig] = useState<ModelsConfig>({ providers: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    readModelsConfig()
      .then((data) => {
        if (!cancelled) setConfig(normalize(data))
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const commit = useCallback(
    async (transform: (providers: ProviderMap) => ProviderMap) => {
      const next = { ...config, providers: transform(config.providers ?? {}) }
      // 以回读结果为准，界面显示的就是磁盘上的内容
      const written = await writeModelsConfig(next)
      refreshRuntimeAfterSave()
      setConfig(normalize(written))
      setSaved(true)
    },
    [config],
  )

  return { providers: config.providers ?? {}, loading, error, saved, commit }
}
