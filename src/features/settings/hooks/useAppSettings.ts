import { refreshRuntimeAfterSave } from '@/store/chat/refreshRuntime'
import { getDeep, setDeep } from './settingsPaths'
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

/** 读写 <agent>/settings.json，对齐 PI-Desktop 的串行即时自动保存 */
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
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const { update, updateMany, read } = useSettingsWriters({
    settings,
    latestRef,
    queueRef,
    timerRef,
    setSettings,
    setSaving,
    setSaved,
    setError,
  })

  return { settings, loading, error, saved, saving, update, updateMany, read }
}

/** 「已自动保存」只在状态行闪一下，1.8s 后自动收掉 */
function flashSaved(
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setSaved: (v: boolean) => void,
) {
  setSaved(true)
  if (timerRef.current) clearTimeout(timerRef.current)
  timerRef.current = setTimeout(() => setSaved(false), 1800)
}

interface WritersOptions {
  settings: PiSettings
  latestRef: React.MutableRefObject<PiSettings>
  queueRef: React.MutableRefObject<Promise<void>>
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  setSettings: (v: PiSettings) => void
  setSaving: (v: boolean) => void
  setSaved: (v: boolean) => void
  setError: (v: string | null) => void
}

/**
 * 写入器：串行落盘、回写权威值、给「已保存」一个 1.8s 的展示窗口。
 *
 * 单独一层是因为它要读四个 ref/state 再返回三个回调，
 * 混在主 hook 里会把「读一次配置」和「怎么保存」两件事搅在一起。
 */
function useSettingsWriters({
  settings,
  latestRef,
  queueRef,
  timerRef,
  setSettings,
  setSaving,
  setSaved,
  setError,
}: WritersOptions) {
  const persist = useCallback(
    (next: PiSettings) => {
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
          flashSaved(timerRef, setSaved)
        } catch (e: unknown) {
          setError(errorMessage(e))
        } finally {
          setSaving(false)
        }
      })
    },
    [latestRef, queueRef, setError, setSaved, setSaving, setSettings, timerRef],
  )

  const update = useCallback(
    (path: string, next: unknown) => persist(setDeep(latestRef.current, path, next)),
    [persist, latestRef],
  )
  const updateMany = useCallback(
    (entries: Array<[string, unknown]>) =>
      persist(entries.reduce((acc, [p, v]) => setDeep(acc, p, v), latestRef.current)),
    [persist, latestRef],
  )
  const read = useCallback(
    <T>(path: string, fallback: T): T => {
      const found = getDeep(settings, path)
      return (found === undefined ? fallback : found) as T
    },
    [settings],
  )

  return { update, updateMany, read }
}
