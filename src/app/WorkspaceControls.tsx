import { Monitor } from 'lucide-react'
import { PanelBottomIcon, PanelRightIcon } from '@/design/icons'
import { IconButton } from '@/design/primitives/IconButton'
import { shortcut } from '@/shared/utils/platform'
import { useAppStore } from '@/store/app.store'
import { useComputerUseStore } from '@/store/computerUse.store'
import styles from './App.module.css'

export function WorkspaceControls() {
  const terminalOpen = useAppStore((s) => s.terminalOpen)
  const toggleTerminal = useAppStore((s) => s.toggleTerminal)
  const panelOpen = useAppStore((s) => s.rightPanelOpen)
  const togglePanel = useAppStore((s) => s.toggleRightPanel)
  const cuWindows = useComputerUseStore((s) => s.windows)
  const previewOpen = useComputerUseStore((s) => s.previewOpen)
  const setPreviewOpen = useComputerUseStore((s) => s.setPreviewOpen)

  const showReopen = cuWindows.length > 0 && !previewOpen
  const hasActiveCu = cuWindows.some((w) => w.active)

  return (
    <div
      className={styles.windowTools}
      role="group"
      aria-label="窗口工具"
      data-tauri-drag-region="deep"
    >
      {showReopen && (
        <IconButton
          ariaLabel="打开操作预览"
          title={`打开桌面控制操作预览（${cuWindows.length} 个窗口）`}
          onClick={() => setPreviewOpen(true)}
        >
          <span className={styles.cuReopenWrap}>
            <Monitor size={15} />
            <span className={styles.cuReopenDot} data-active={hasActiveCu} />
          </span>
        </IconButton>
      )}
      <IconButton
        ariaLabel="切换终端"
        title={`底部终端（${shortcut('T')}）`}
        active={terminalOpen}
        onClick={toggleTerminal}
      >
        <PanelBottomIcon />
      </IconButton>
      <IconButton
        ariaLabel="切换右侧面板"
        title={`切换右侧面板（${shortcut('\\')}）`}
        active={panelOpen}
        onClick={togglePanel}
      >
        <PanelRightIcon />
      </IconButton>
    </div>
  )
}
