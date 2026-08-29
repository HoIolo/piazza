import { useState } from 'react'
import { FolderOpen, PanelBottom, PanelRight } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { EnvMenu } from './EnvMenu'
import { OpenLocationButton } from './OpenLocationButton'
import { SessionMenu } from './SessionMenu'
import styles from './TopBar.module.css'

export interface TopBarProps {
  terminalOpen: boolean
  onToggleTerminal: () => void
  /** 会话标题，空状态下为 null */
  title: string | null
  cwd: string | null
  rightPanelOpen: boolean
  onToggleRightPanel: () => void
  onRename: (name: string) => void
  onExport: () => Promise<string | null>
}

/**
 * 主区顶栏。整条是窗口拖拽区，按钮区域单独排除。
 *
 * 空状态只留终端与右侧面板两个开关：标题、「打开位置」、环境信息
 * 都是针对某次会话的，没有会话时它们无所指。
 *
 * 不放最小化按钮——窗口交通灯已在侧栏左上角，再来一个是重复的。
 * Codex 原版右侧还有「任务列表」，pi 没有任务概念，故不保留。
 */
export function TopBar({
  title,
  cwd,
  terminalOpen,
  onToggleTerminal,
  rightPanelOpen,
  onToggleRightPanel,
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
    <header className={styles.bar} data-tauri-drag-region>
      {title && (
        <div className={styles.left}>
          <FolderOpen size={16} className={styles.folder} />
          {editing ? (
            <input
              className={styles.titleInput}
              defaultValue={title}
              autoFocus
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
            <EnvMenu />
          </>
        )}
        <IconButton ariaLabel="切换终端" active={terminalOpen} onClick={onToggleTerminal}>
          <PanelBottom size={17} />
        </IconButton>
        <IconButton ariaLabel="切换右侧面板" active={rightPanelOpen} onClick={onToggleRightPanel}>
          <PanelRight size={17} />
        </IconButton>
      </div>
    </header>
  )
}
