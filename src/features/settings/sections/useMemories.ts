import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import {
  clearMemories,
  clearMemoryHandoff,
  deleteMemory,
  listMemories,
  type MemoryItem,
  type MemoryOverview,
  type MemoryScope,
} from '@/shared/api/memory'
import { errorMessage } from '@/shared/utils/error'

function useMemoryMutations(
  cwd: string | null,
  reload: () => void,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const run = useCallback(
    async (task: () => Promise<void>) => {
      try {
        await task()
        reload()
      } catch (e: unknown) {
        setError(errorMessage(e))
      }
    },
    [reload, setError],
  )

  const removeItem = useCallback(
    (item: MemoryItem) => run(() => deleteMemory(cwd, item.scope, item.id)),
    [cwd, run],
  )
  const clearScope = useCallback(
    (scope: MemoryScope) => run(() => clearMemories(cwd, scope)),
    [cwd, run],
  )
  const dropHandoff = useCallback(
    () => (cwd ? run(() => clearMemoryHandoff(cwd)) : Promise.resolve()),
    [cwd, run],
  )

  return { removeItem, clearScope, dropHandoff }
}

/** 管理记忆列表加载、删除、清空作用域与清除压缩交接；每次打开设置自动刷新以同步 Agent 刚写入的记忆 */
export function useMemories(cwd: string | null, visible = true) {
  const [overview, setOverview] = useState<MemoryOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    listMemories(cwd)
      .then((res) => {
        if (cancelled) return
        setOverview(res)
        setError(null)
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
  }, [cwd, visible, nonce])

  const mutations = useMemoryMutations(cwd, reload, setError)
  return { overview, loading, error, reload, ...mutations }
}
