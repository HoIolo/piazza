import { useCallback } from 'react'
import { readAppSettings, writeAppSettings, type PiSettings } from '@/shared/api/config'
import { useEditableConfig } from './useEditableConfig'

interface UseAppSettingsResult {
  settings: PiSettings
  loading: boolean
  error: string | null
  dirty: boolean
  saved: boolean
  saving: boolean
  /** 支持 "compaction.enabled" 形式的嵌套键 */
  update: (path: string, value: unknown) => void
  read: <T>(path: string, fallback: T) => T
  save: () => void
}

/** 按点分路径写入嵌套对象，返回新对象（不修改原值） */
function setDeep(source: PiSettings, path: string, value: unknown): PiSettings {
  const keys = path.split('.')
  const result = { ...source }
  let cursor: Record<string, unknown> = result

  keys.slice(0, -1).forEach((key) => {
    const existing = cursor[key]
    const next = typeof existing === 'object' && existing !== null ? { ...existing } : {}
    cursor[key] = next
    cursor = next as Record<string, unknown>
  })

  cursor[keys[keys.length - 1]] = value
  return result
}

function getDeep(source: PiSettings, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (typeof acc !== 'object' || acc === null) return undefined
    return (acc as Record<string, unknown>)[key]
  }, source)
}

/** 编辑 ~/.pi/agent/settings.json。与模型配置一样，改本地草稿、显式保存 */
export function useAppSettings(): UseAppSettingsResult {
  const { value, edit, loading, error, dirty, saved, saving, save } = useEditableConfig(
    readAppSettings,
    writeAppSettings,
    {} as PiSettings,
  )

  const update = useCallback(
    (path: string, next: unknown) => edit((prev) => setDeep(prev, path, next)),
    [edit],
  )

  const read = useCallback(
    <T,>(path: string, fallback: T): T => {
      const found = getDeep(value, path)
      return (found === undefined ? fallback : found) as T
    },
    [value],
  )

  return { settings: value, loading, error, dirty, saved, saving, update, read, save }
}
