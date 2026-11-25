import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import {
  checkoutGitBranch,
  fetchGitRemotes,
  listGitBranches,
  type GitBranch,
} from '@/shared/api/git'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'

function useBranchActions(
  cwd: string | null,
  setBranches: Dispatch<SetStateAction<GitBranch[]>>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const [fetching, setFetching] = useState(false)
  const [switching, setSwitching] = useState(false)
  const refreshGit = useAppStore((s) => s.refreshGit)

  const syncRemotes = useCallback(async () => {
    if (!cwd || fetching) return
    setFetching(true)
    setError(null)
    try {
      await fetchGitRemotes(cwd)
      setBranches(await listGitBranches(cwd))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setFetching(false)
    }
  }, [cwd, fetching, setBranches, setError])

  const switchTo = useCallback(
    async (name: string, opts: { create?: boolean; remote?: boolean }, close: () => void) => {
      if (!cwd || switching) return
      setSwitching(true)
      setError(null)
      try {
        await checkoutGitBranch(cwd, name, Boolean(opts.create), Boolean(opts.remote))
        refreshGit()
        close()
      } catch (e) {
        setError(errorMessage(e))
      } finally {
        setSwitching(false)
      }
    },
    [cwd, switching, refreshGit, setError],
  )

  return { fetching, switching, syncRemotes, switchTo }
}

/** 管理本地 + 远程分支列表拉取、远程刷新与切换状态 */
export function useBranches(cwd: string | null, enabled: boolean) {
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nonce = useAppStore((s) => s.gitNonce)
  const loadKey = cwd ? `${cwd}:${nonce}` : null

  useEffect(() => {
    if (!enabled || !cwd) return
    let cancelled = false
    listGitBranches(cwd)
      .then((list) => {
        if (!cancelled) setBranches(list)
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(loadKey)
      })
    return () => {
      cancelled = true
    }
  }, [cwd, enabled, loadKey])

  const actions = useBranchActions(cwd, setBranches, setError)

  return {
    branches,
    loading: enabled && loadedKey !== loadKey,
    error,
    clearError: () => setError(null),
    ...actions,
  }
}
