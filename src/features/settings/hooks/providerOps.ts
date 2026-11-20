import type { ModelConfig, ProviderConfig } from '@/shared/api/config'

export type ProviderMap = Record<string, ProviderConfig>

/**
 * 重命名 provider 的键名。
 * 需要重建整个对象而不是删一个加一个——键名即插入顺序，
 * 直接增删会让被改的那一项跳到列表末尾。
 */
export function renameKey(providers: ProviderMap, from: string, to: string): ProviderMap {
  if (from === to || !providers[from] || providers[to]) return providers
  return Object.fromEntries(
    Object.entries(providers).map(([key, value]) => [key === from ? to : key, value]),
  )
}

export function removeKey(providers: ProviderMap, key: string): ProviderMap {
  const next = { ...providers }
  delete next[key]
  return next
}

/** 新建或整体替换一个 provider */
export function putProvider(
  providers: ProviderMap,
  key: string,
  provider: ProviderConfig,
): ProviderMap {
  return { ...providers, [key]: provider }
}

/** 替换 provider 下的模型列表，其余字段原样保留 */
function withModels(providers: ProviderMap, key: string, models: ModelConfig[]): ProviderMap {
  return putProvider(providers, key, { ...providers[key], models })
}

/** index 为 null 时追加，否则替换该位置的模型 */
export function putModel(
  providers: ProviderMap,
  key: string,
  index: number | null,
  model: ModelConfig,
): ProviderMap {
  const models = providers[key]?.models ?? []
  const next = index === null ? [...models, model] : models.map((m, i) => (i === index ? model : m))
  return withModels(providers, key, next)
}

export function removeModel(providers: ProviderMap, key: string, index: number): ProviderMap {
  const models = providers[key]?.models ?? []
  return withModels(
    providers,
    key,
    models.filter((_, i) => i !== index),
  )
}
