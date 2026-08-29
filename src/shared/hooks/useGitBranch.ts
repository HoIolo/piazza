import { useEffect, useState } from 'react'
import { readGitBranch } from '@/shared/api/git'
import { useAppStore } from '@/store/app.store'

/** 读取当前工作目录的 git 分支，非 git 仓库时为 null。切换分支后随 gitNonce 自动重取 */
export function useGitBranch(cwd: string | null): string | null {
  const [branch, setBranch] = useState<string | null>(null)
  const nonce = useAppStore((s) => s.gitNonce)

  useEffect(() => {
    let cancelled = false

    // 无 cwd 时也走 Promise 分支，保证 effect 内不出现同步 setState
    const task = cwd ? readGitBranch(cwd) : Promise.resolve(null)

    task
      .then((name) => {
        if (!cancelled) setBranch(name)
      })
      .catch(() => {
        if (!cancelled) setBranch(null)
      })

    return () => {
      cancelled = true
    }
  }, [cwd, nonce])

  return branch
}
