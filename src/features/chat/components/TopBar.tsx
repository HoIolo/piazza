import { useState } from 'react'
import { EnvIcon, FolderIcon, PanelLeftIcon } from '@/design/icons'
import { IconButton } from '@/design/primitives/IconButton'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { EnvMenu } from './EnvMenu'
import { OpenLocationButton } from './OpenLocationButton'
import { SessionMenu } from './SessionMenu'
import styles from './TopBar.module.css'
import { shortcut } from '@/shared/utils/platform'

export interface TopBarProps {
  /** 会话标题，空状态下为 null */
  title: string | null
  cwd: string | null
  /** 侧栏收起时，展开它的按钮移到顶栏最左，并给交通灯让出位置 */
  sidebarOpen: boolean
  onToggleSidebar: () => void
  /**
   * 环境信息是否停靠在会话区右侧。停靠时顶栏这个位置只是它的开关；
   * 不停靠（主区太窄）时同一位置换成弹窗入口。
   */
  envDocked: boolean
  envPanelOpen: boolean
  onToggleEnvPanel: () => void
  onRename: (name: string) => void
  onExport: () => Promise<string | null>
}

/** 会话标题与环境操作。窗口级工具由主窗口统一定位。 */
export function TopBar({
  title,
  cwd,
  sidebarOpen,
  onToggleSidebar,
  envDocked,
  envPanelOpen,
  onToggleEnvPanel,
  onRename,
  onExport,
}: TopBarProps) {
  const [editing, setEditing] = useState(false)
  const ime = useImeGuard()

  const commit = (value: string) => {
    setEditing(false)
    const name = value.trim()
    if (name && name !== title) onRename(name)
  }

  return (
    <header className={styles.bar} data-sidebar-open={sidebarOpen} data-tauri-drag-region="deep">
      {!sidebarOpen && (
        <IconButton
          ariaLabel="展开侧栏"
          title={`展开侧栏（${shortcut('B')}）`}
          onClick={onToggleSidebar}
        >
          <PanelLeftIcon />
        </IconButton>
      )}
      {title && (
        <div className={styles.left}>
          <FolderIcon size={18} className={styles.folder} />
          {editing ? (
            <input
              className={styles.titleInput}
              defaultValue={title}
              autoFocus
              onFocus={(e) => e.target.select()}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !ime.isComposing(e)) commit(e.currentTarget.value)
                if (e.key === 'Escape') setEditing(false)
              }}
              {...ime.bind}
            />
          ) : (
            <button
              type="button"
              className={styles.title}
              onDoubleClick={() => setEditing(true)}
              title="双击重命名"
            >
              {title}
            </button>
          )}
          <SessionMenu onRename={() => setEditing(true)} onExport={onExport} />
        </div>
      )}

      <div className={styles.right}>
        {title && (
          <>
            <OpenLocationButton target={cwd} />
            {envDocked ? (
              <IconButton ariaLabel="环境信息" active={envPanelOpen} onClick={onToggleEnvPanel}>
                <EnvIcon />
              </IconButton>
            ) : (
              <EnvMenu />
            )}
          </>
        )}
      </div>
    </header>
  )
}
