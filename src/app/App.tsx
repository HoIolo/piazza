import { ChatView } from '@/features/chat'
import { CommandPalette } from '@/features/palette'
import { RightPanel } from '@/features/rightpanel'
import { SettingsView } from '@/features/settings'
import { Sidebar } from '@/features/sidebar'
import { TerminalPanel } from '@/features/terminal'
import { useAppStore } from '@/store/app.store'
import { useAgentSession } from '@/store/chat'
import { useBootstrap } from './useBootstrap'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import styles from './App.module.css'

/** 主窗口。这里只做组装与布线，不承载业务逻辑 */
export function App() {
  useBootstrap()
  useAgentSession()
  useGlobalShortcuts()

  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const settingsMounted = useAppStore((s) => s.settingsMounted)
  const settingsSection = useAppStore((s) => s.settingsSection)

  return (
    <div className={styles.root}>
      {/* 设置展开时主界面轻微后退，形成层次而非硬切 */}
      <div className={styles.shell} data-dimmed={settingsOpen} aria-hidden={settingsOpen}>
        <Sidebar />
        {/* 终端属于会话区，压在它下面；左侧会话树保持通高 */}
        <div className={styles.center}>
          <ChatView />
          <TerminalPanel />
        </div>
        <RightPanel open={rightPanelOpen} />
        <CommandPalette />
      </div>

      {settingsMounted && (
        <div className={styles.settingsLayer} data-open={settingsOpen}>
          {/* key 随请求的分区变化，让「扩展包」这类直达入口每次都落到指定分区 */}
          <SettingsView key={settingsSection ?? 'default'} initialSection={settingsSection} />
        </div>
      )}
    </div>
  )
}
