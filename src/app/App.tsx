import { ChatView } from '@/features/chat'
import { SideChat } from '@/features/chat/components/SideChat'
import { ImportPiConfigDialog } from '@/features/onboarding/ImportPiConfigDialog'
import { UpdateDialog } from '@/features/updater/UpdateDialog'
import { CommandPalette } from '@/features/palette'
import { RightPanel } from '@/features/rightpanel'
import { SettingsView } from '@/features/settings'
import { Sidebar } from '@/features/sidebar'
import { TerminalPanel } from '@/features/terminal'
import { WorkspaceTerminal } from '@/features/terminal/WorkspaceTerminal'
import { isMac } from '@/shared/utils/platform'
import { useAppStore } from '@/store/app.store'
import { useAgentSession } from '@/store/chat'
import { useAutoUpdate } from './useAutoUpdate'
import { useBootstrap } from './useBootstrap'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { useSessionPanelMemory } from './useSessionPanelMemory'
import { WindowControls } from './WindowControls'
import { WorkspaceControls } from './WorkspaceControls'
import styles from './App.module.css'

/** 主窗口。这里只做组装与布线，不承载业务逻辑 */
export function App() {
  useBootstrap()
  useAgentSession()
  useGlobalShortcuts()
  useSessionPanelMemory()
  useAutoUpdate()

  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const settingsMounted = useAppStore((s) => s.settingsMounted)
  const settingsSection = useAppStore((s) => s.settingsSection)

  return (
    <div className={styles.root}>
      {/* 设置展开时主界面轻微后退，形成层次而非硬切 */}
      <div
        className={styles.shell}
        data-dimmed={settingsOpen}
        data-workspace-open={rightPanelOpen}
        inert={settingsOpen}
      >
        <Sidebar />
        {/* 终端属于会话区，压在它下面；左侧会话树保持通高 */}
        <div className={styles.center}>
          <ChatView />
          <TerminalPanel />
        </div>
        <RightPanel open={rightPanelOpen} sideChat={SideChat} terminal={WorkspaceTerminal} />
        <WorkspaceControls />
        <CommandPalette />
      </div>

      {/* 换目录后第一次启动：问一次要不要把 pi CLI 的配置搬过来 */}
      <ImportPiConfigDialog />

      {/*
        Windows 没有系统标题栏，三个窗口按钮自己画；macOS 走系统红绿灯。
        放在 .shell 外面：设置页展开时 .shell 是 inert 的，
        按钮跟着惰性化的话就没法关窗口了。
      */}
      {!isMac() && <WindowControls />}

      <UpdateDialog />

      {settingsMounted && (
        <div className={styles.settingsLayer} data-open={settingsOpen}>
          {/* key 随请求的分区变化，让「扩展包」这类直达入口每次都落到指定分区 */}
          <SettingsView key={settingsSection ?? 'default'} initialSection={settingsSection} />
        </div>
      )}
    </div>
  )
}
