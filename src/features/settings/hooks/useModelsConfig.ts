import { useCallback } from 'react'
import {
  readModelsConfig,
  writeModelsConfig,
  type ModelsConfig,
  type ProviderConfig,
} from '@/shared/api/config'
import { appendProvider, removeKey, renameKey, replaceProvider, type ProviderMap } from './providerOps'
import { useEditableConfig } from './useEditableConfig'

interface UseModelsConfigResult {
  config: ModelsConfig
  loading: boolean
  error: string | null
  saved: boolean
  saving: boolean
  dirty: boolean
  updateProvider: (key: string, patch: ProviderConfig) => void
  renameProvider: (from: string, to: string) => void
  removeProvider: (key: string) => void
  addProvider: () => void
  save: () => void
}

/** providers 缺省时补空对象，后续操作就不必反复判空 */
function normalize(config: ModelsConfig): ModelsConfig {
  return { providers: {}, ...config }
}

// 模块级定义以保证引用稳定，useEditableConfig 的加载 effect 依赖于此
const load = () => readModelsConfig().then(normalize)
const write = (config: ModelsConfig) => writeModelsConfig(config).then(normalize)

/** 编辑 ~/.pi/agent/models.json 的 provider 与 model */
export function useModelsConfig(): UseModelsConfigResult {
  const { value, edit, loading, error, dirty, saved, saving, save } = useEditableConfig(
    load,
    write,
    { providers: {} } as ModelsConfig,
  )

  const apply = useCallback(
    (transform: (providers: ProviderMap) => ProviderMap) => {
      edit((prev) => ({ ...prev, providers: transform(prev.providers ?? {}) }))
    },
    [edit],
  )

  return {
    config: value,
    loading,
    error,
    saved,
    saving,
    dirty,
    save,
    updateProvider: useCallback((key, patch) => apply((p) => replaceProvider(p, key, patch)), [apply]),
    renameProvider: useCallback((from, to) => apply((p) => renameKey(p, from, to)), [apply]),
    removeProvider: useCallback((key) => apply((p) => removeKey(p, key)), [apply]),
    addProvider: useCallback(() => apply(appendProvider), [apply]),
  }
}
