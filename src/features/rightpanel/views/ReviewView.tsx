import { useEffect, useState } from 'react'
import { Skeleton } from '@/design/primitives/Skeleton'
import { readGitDiff } from '@/shared/api/git'
import { diffLines } from '@/shared/utils/diff'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import styles from './ReviewView.module.css'

export function ReviewView() {
  const cwd = useAppStore((s) => s.currentCwd)
  const selection = useAppStore((s) => s.reviewTarget)
  const target = selection?.cwd === cwd ? selection : null
  const path = target?.path
  const savedDiff = target?.diff
  const nonce = useAppStore((s) => s.gitNonce)
  const key = JSON.stringify([cwd, nonce, target?.nonce])

  if (!cwd) return <div className={styles.empty}>当前没有工作区</div>
  if (savedDiff) return <DiffContent key={key} diff={savedDiff} path={path} />
  return <WorkspaceDiff key={key} cwd={cwd} path={path} />
}

function WorkspaceDiff({ cwd, path }: { cwd: string; path?: string }) {
  const [state, setState] = useState<{ diff?: string; error?: string }>()

  useEffect(() => {
    let cancelled = false
    readGitDiff(cwd, path)
      .then((diff) => {
        if (!cancelled) setState({ diff })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ error: errorMessage(e) })
      })
    return () => {
      cancelled = true
    }
  }, [cwd, path])

  if (state?.error) return <div className={styles.empty}>{state.error}</div>
  if (!state) {
    return (
      <div className={styles.loading}>
        <Skeleton height="12px" width="80%" />
        <Skeleton height="12px" width="60%" />
        <Skeleton height="12px" width="70%" />
      </div>
    )
  }

  return <DiffContent diff={state.diff ?? ''} path={path} />
}

function DiffContent({ diff, path }: { diff: string; path?: string }) {
  return (
    <>
      {path && (
        <div className={styles.fileName} title={path}>
          {path}
        </div>
      )}
      {diff.trim() ? (
        <pre className={`${styles.diff} selectable`}>
          {diffLines(diff).map(({ text, kind }, i) => (
            <span key={i} className={styles.line} data-kind={kind}>
              {text || ' '}
            </span>
          ))}
        </pre>
      ) : (
        <div className={styles.empty}>
          {path ? '此文件暂无可查看的差异' : '工作区没有未提交的改动'}
        </div>
      )}
    </>
  )
}
