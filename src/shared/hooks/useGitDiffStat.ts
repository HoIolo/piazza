import { useEffect, useState } from 'react'
import { readGitDiffStat } from '@/shared/api/git'
import { useAppStore } from '@/store/app.store'

export interface DiffStat {
  added: number
  removed: number
}

/** 工作区增删行数。随 gitNonce 重取，切分支后数字会跟着更新 */
export function useGitDiffStat(cwd: string | null): DiffStat | null {
  const [stat, setStat] = useState<DiffStat | null>(null)
  const nonce = useAppStore((s) => s.gitNonce)

  useEffect(() => {
    let cancelled = false
    const task = cwd ? readGitDiffStat(cwd) : Promise.resolve(null)

    task
      .then((result) => {
        if (cancelled) return
        setStat(result ? { added: result[0], removed: result[1] } : null)
      })
      .catch(() => {
        if (!cancelled) setStat(null)
      })

    return () => {
      cancelled = true
    }
  }, [cwd, nonce])

  return stat
}
