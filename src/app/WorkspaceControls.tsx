import { PanelBottomIcon, PanelRightIcon } from '@/design/icons'
import { IconButton } from '@/design/primitives/IconButton'
import { useAppStore } from '@/store/app.store'
import styles from './App.module.css'

export function WorkspaceControls() {
  const terminalOpen = useAppStore((s) => s.terminalOpen)
  const toggleTerminal = useAppStore((s) => s.toggleTerminal)
  const panelOpen = useAppStore((s) => s.rightPanelOpen)
  const togglePanel = useAppStore((s) => s.toggleRightPanel)

  return (
    <div className={styles.windowTools} role="group" aria-label="窗口工具" data-tauri-drag-region="deep">
      <IconButton
        ariaLabel="切换终端"
        title="底部终端（⌘T）"
        active={terminalOpen}
        onClick={toggleTerminal}
      >
        <PanelBottomIcon />
      </IconButton>
      <IconButton
        ariaLabel="切换右侧面板"
        title="切换右侧面板（⌘\\）"
        active={panelOpen}
        onClick={togglePanel}
      >
        <PanelRightIcon />
      </IconButton>
    </div>
  )
}
