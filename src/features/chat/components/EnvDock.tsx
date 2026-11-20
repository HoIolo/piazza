import { useAppStore } from '@/store/app.store'
import { EnvInfo } from './EnvInfo'
import styles from './EnvDock.module.css'

/**
 * 停靠在会话区右侧的环境信息卡片。
 *
 * 只在主区够宽时由 ChatView 挂载；开关状态自己从 store 读，
 * 顶栏按钮切的就是这一个值。
 */
export function EnvDock() {
  const open = useAppStore((s) => s.envPanelOpen)
  if (!open) return null

  return (
    <aside className={styles.dock} aria-label="环境信息">
      <EnvInfo />
    </aside>
  )
}
