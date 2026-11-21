import { useEffect, useState } from 'react'
import { readGitDiff } from '@/shared/api/git'
import { countDiffLines } from '@/shared/utils/diff'
import type { FileChange } from './index'

export function useFileChangeStats(changes: FileChange[], cwd: string | null) {
  const paths = JSON.stringify(
    changes
      .filter(({ additions, deletions }) => additions === null || deletions === null)
      .map(({ path }) => path),
  )
  const key = JSON.stringify([cwd, paths])
  const [state, setState] = useState<{
    key: string
    stats: Map<string, ReturnType<typeof countDiffLines>>
  }>()

  useEffect(() => {
    const missing: string[] = JSON.parse(paths)
    if (!cwd || !missing.length) return
    let current = true
    void Promise.all(
      missing.map(async (path) => {
        const diff = await readGitDiff(cwd, path).catch(() => '')
        return diff.trim() ? [[path, countDiffLines(diff)] as const] : []
      }),
    ).then((entries) => {
      if (current) setState({ key, stats: new Map(entries.flat()) })
    })
    return () => {
      current = false
    }
  }, [cwd, key, paths])

  if (state?.key !== key) return changes
  return changes.map((change) => ({ ...change, ...state.stats.get(change.path) }))
}
