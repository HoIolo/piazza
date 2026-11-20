import { useCallback, useEffect, useId, useState } from 'react'
import { closeTerminal } from '@/shared/api/terminal'
import { basename } from '@/shared/utils/path'
import { useAppStore } from '@/store/app.store'
import { TerminalTab } from './components/TerminalTab'
import styles from './TerminalPanel.module.css'

function WorkspaceShell({ cwd, restart }: { cwd: string | null; restart: () => void }) {
  const id = `workspace-${useId()}`
  const [exited, setExited] = useState(false)
  const onExit = useCallback(() => setExited(true), [])

  useEffect(() => {
    return () => {
      // 严格模式重挂载不会更换 id。等当前提交结束后，只回收真正移除的标签。
      queueMicrotask(() => {
        if (!document.getElementById(id)) void closeTerminal(id)
      })
    }
  }, [id])

  return (
    <div className={styles.workspace} id={id}>
      <header className={styles.tabBar}>
        <span title={cwd ?? undefined}>{cwd ? basename(cwd) : 'Shell'}</span>
        {exited && (
          <button type="button" onClick={restart}>
            重新打开终端
          </button>
        )}
      </header>
      <div className={styles.body}>
        <TerminalTab id={id} cwd={cwd} active onExit={onExit} />
      </div>
    </div>
  )
}

export function WorkspaceTerminal() {
  const currentCwd = useAppStore((s) => s.currentCwd)
  const [cwd, setCwd] = useState(currentCwd)
  const [attempt, setAttempt] = useState(0)
  return (
    <WorkspaceShell
      key={attempt}
      cwd={cwd}
      restart={() => {
        setCwd(currentCwd)
        setAttempt((value) => value + 1)
      }}
    />
  )
}
