import type { PiSettings } from '@/shared/api/config'

/** 按 "a.b.c" 写一层嵌套值；value 为 undefined 时删除该键 */
export function setDeep(source: PiSettings, path: string, value: unknown): PiSettings {
  const keys = path.split('.')
  const result = { ...source }
  let cursor: Record<string, unknown> = result
  keys.slice(0, -1).forEach((key) => {
    const existing = cursor[key]
    const next = typeof existing === 'object' && existing !== null ? { ...existing } : {}
    cursor[key] = next
    cursor = next as Record<string, unknown>
  })
  if (value === undefined) delete cursor[keys[keys.length - 1]]
  else cursor[keys[keys.length - 1]] = value
  return result
}

export function getDeep(source: PiSettings, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (typeof acc !== 'object' || acc === null) return undefined
    return (acc as Record<string, unknown>)[key]
  }, source)
}
