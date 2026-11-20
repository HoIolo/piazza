import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/shared/utils/error'

export interface EditableConfig<T> {
  value: T
  /** 以纯函数改写草稿，并标记为未保存 */
  edit: (transform: (prev: T) => T) => void
  loading: boolean
  error: string | null
  dirty: boolean
  saved: boolean
  saving: boolean
  save: () => void
}

/**
 * 「读取 → 本地草稿 → 显式保存」的配置编辑状态机。
 *
 * 目前只有 settings.json 走这套：它的字段散在几个分区里，需要攒成草稿再一次保存；
 * models.json 的每次改动都在一个对话框里完成，直接落盘，见 useModelsConfig。
 * 全程只改本地副本，显式保存时才落盘——避免编辑中途的半成品配置让 pi 起不来。
 *
 * `load` 与 `write` 必须是稳定引用（模块级函数），否则加载 effect 会反复触发。
 */
export function useEditableConfig<T>(
  load: () => Promise<T>,
  write: (value: T) => Promise<T>,
  initial: T,
): EditableConfig<T> {
  const [value, setValue] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    load()
      .then((data) => {
        if (!cancelled) setValue(data)
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
  }, [load])

  const edit = useCallback((transform: (prev: T) => T) => {
    setValue(transform)
    setDirty(true)
    setSaved(false)
  }, [])

  const save = useCallback(() => {
    setSaving(true)
    write(value)
      .then((written) => {
        setValue(written)
        setDirty(false)
        setSaved(true)
        setError(null)
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setSaving(false))
  }, [write, value])

  return { value, edit, loading, error, dirty, saved, saving, save }
}
