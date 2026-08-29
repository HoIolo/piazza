import { useTerminalSession } from '../useTerminalSession'
import styles from './TerminalTab.module.css'

export interface TerminalTabProps {
  id: string
  cwd: string | null
  /** 非当前标签仍保持挂载，只是隐藏——卸载会丢掉整个滚动缓冲和运行中的进程 */
  active: boolean
  onExit: (id: string) => void
}

export function TerminalTab({ id, cwd, active, onExit }: TerminalTabProps) {
  const hostRef = useTerminalSession(id, cwd, onExit)
  return <div className={styles.host} ref={hostRef} data-active={active} />
}
