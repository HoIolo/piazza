import { refreshRuntimeAfterSave } from '@/store/chat/refreshRuntime'
import { useCallback, useEffect, useRef, useState } from 'react'
import { readAppSettings, writeAppSettings, type PiSettings } from '@/shared/api/config'
import { errorMessage } from '@/shared/utils/error'

export interface AppSettingsHandle {
  settings: PiSettings
  loading: boolean
  error: string | null
  saved: boolean
  saving: boolean
  /** 支持 "compaction.enabled" 形式的嵌套键，修改后立即原子落盘 */
  update: (path: string, value: unknown) => void
  /** 一次性原子更新多个键（例如同时切换 defaultProvider 与 defaultModel） */
  updateMany: (entries: Array<[string, unknown]>) => void
  read: <T>(path: string, fallback: T) => T
}

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
  if (value === undefined) delete cursor[keys[keys.length - 1]]
  else cursor[keys[keys.length - 1]] = value
  return result
}

function getDeep(source: PiSettings, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (typeof acc !== 'object' || acc === null) return undefined
    return (acc as Record<string, unknown>)[key]
  }, source)
}

function useInitialLoad(
  latestRef: React.MutableRefObject<PiSettings>,
  setSettings: (v: PiSettings) => void,
  setError: (e: string | null) => void,
  setLoading: (l: boolean) => void,
) {
  useEffect(() => {
    let cancelled = false
    readAppSettings()
      .then((data) => {
        if (cancelled) return
        latestRef.current = data
        setSettings(data)
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
  }, [latestRef, setSettings, setError, setLoading])
}

/** 读写 ~/.pi/agent/settings.json，对齐 PI-Desktop 的串行即时自动保存 */
export function useAppSettings(): AppSettingsHandle {
  const [settings, setSettings] = useState<PiSettings>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const latestRef = useRef<PiSettings>({})
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useInitialLoad(latestRef, setSettings, setError, setLoading)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const persist = useCallback((next: PiSettings) => {
    latestRef.current = next
    setSettings(next)
    setSaving(true)
    setError(null)
    queueRef.current = queueRef.current.then(async () => {
      try {
        const written = await writeAppSettings(next)
        refreshRuntimeAfterSave()
        latestRef.current = written
        setSettings(written)
        setSaved(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setSaved(false), 1800)
      } catch (e: unknown) {
        setError(errorMessage(e))
      } finally {
        setSaving(false)
      }
    })
  }, [])

  const update = useCallback(
    (path: string, next: unknown) => persist(setDeep(latestRef.current, path, next)),
    [persist],
  )
  const updateMany = useCallback(
    (entries: Array<[string, unknown]>) =>
      persist(entries.reduce((acc, [p, v]) => setDeep(acc, p, v), latestRef.current)),
    [persist],
  )
  const read = useCallback(
    <T,>(path: string, fallback: T): T => {
      const found = getDeep(settings, path)
      return (found === undefined ? fallback : found) as T
    },
    [settings],
  )

  return { settings, loading, error, saved, saving, update, updateMany, read }
}
