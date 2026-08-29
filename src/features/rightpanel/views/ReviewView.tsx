import { useEffect, useState } from 'react'
import { Skeleton } from '@/design/primitives/Skeleton'
import { readGitDiff } from '@/shared/api/git'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import styles from './ReviewView.module.css'

/** 按行首字符判定这一行在 diff 里的角色 */
function lineKind(line: string): 'add' | 'del' | 'meta' | 'hunk' | 'text' {
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta'
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'meta'
  return 'text'
}

/** 工作区 diff。数据源是 `git diff HEAD`，与「变更 +N -M」同一口径 */
export function ReviewView() {
  const cwd = useAppStore((s) => s.currentCwd)
  const nonce = useAppStore((s) => s.gitNonce)
  /*
   * 结果与它对应的请求绑在一起存。若改成「进 effect 先清空再取」，
   * 那次同步 setState 会触发一轮多余渲染；用 key 比对推导加载态，
   * 切换目录时旧内容也不会闪一下再消失。
   */
  const key = `${cwd ?? ''}#${nonce}`
  const [state, setState] = useState<{ key: string; diff?: string; error?: string }>({ key: '' })

  useEffect(() => {
    if (!cwd) return
    let cancelled = false
    readGitDiff(cwd)
      .then((diff) => {
        if (!cancelled) setState({ key, diff })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ key, error: errorMessage(e) })
      })
    return () => {
      cancelled = true
    }
  }, [cwd, key])

  const settled = state.key === key
  if (settled && state.error) return <div className={styles.empty}>{state.error}</div>
  if (!settled) {
    return (
      <div className={styles.loading}>
        <Skeleton height="12px" width="80%" />
        <Skeleton height="12px" width="60%" />
        <Skeleton height="12px" width="70%" />
      </div>
    )
  }

  const diff = state.diff ?? ''
  if (!diff.trim()) return <div className={styles.empty}>工作区没有未提交的改动</div>

  return (
    <pre className={`${styles.diff} selectable`}>
      {diff.split('\n').map((line, i) => (
        <span key={i} className={styles.line} data-kind={lineKind(line)}>
          {line || ' '}
        </span>
      ))}
    </pre>
  )
}
