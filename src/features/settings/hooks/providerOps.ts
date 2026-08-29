import type { ProviderConfig } from '@/shared/api/config'

export type ProviderMap = Record<string, ProviderConfig>

const NEW_PROVIDER: ProviderConfig = {
  name: '新 Provider',
  baseUrl: '',
  api: 'openai-completions',
  apiKey: '',
  models: [],
}

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

/** 追加一个空 provider，键名自动去重 */
export function appendProvider(providers: ProviderMap): ProviderMap {
  let key = 'new-provider'
  let index = 2
  while (providers[key]) key = `new-provider-${index++}`
  return { ...providers, [key]: { ...NEW_PROVIDER, models: [] } }
}

export function removeKey(providers: ProviderMap, key: string): ProviderMap {
  const next = { ...providers }
  delete next[key]
  return next
}

export function replaceProvider(
  providers: ProviderMap,
  key: string,
  provider: ProviderConfig,
): ProviderMap {
  return { ...providers, [key]: provider }
}
