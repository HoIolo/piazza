import { openUrl } from '@tauri-apps/plugin-opener'
import { BookOpen, CircleHelp, Settings } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import styles from './SidebarFooter.module.css'

const PI_DOCS_URL = 'https://github.com/earendil-works/pi'

export interface SidebarFooterProps {
  /** 当前配置档名称，对应截图底部的 “custom” */
  profileName: string
  onOpenSettings: () => void
}

/** 侧栏底部。配置档名点开是菜单，与 Codex 左下角的行为一致 */
export function SidebarFooter({ profileName, onOpenSettings }: SidebarFooterProps) {
  return (
    <footer className={styles.footer}>
      <Popover
        side="top"
        className={styles.profileSlot}
        trigger={({ toggle, open }) => (
          <button
            type="button"
            className={styles.profile}
            data-open={open}
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <Settings size={18} className={styles.icon} />
            <span className={styles.name}>{profileName}</span>
          </button>
        )}
      >
        {(close) => (
          <div className={styles.menu}>
            <div className={styles.menuTitle}>{profileName}</div>
            <MenuSeparator />
            <MenuItem
              icon={<Settings size={16} />}
              hint="⌘,"
              onClick={() => {
                onOpenSettings()
                close()
              }}
            >
              设置
            </MenuItem>
            <MenuItem
              icon={<BookOpen size={16} />}
              onClick={() => {
                void openUrl(PI_DOCS_URL)
                close()
              }}
            >
              pi 使用文档
            </MenuItem>
          </div>
        )}
      </Popover>

      <IconButton ariaLabel="打开 pi 文档" size="sm" onClick={() => void openUrl(PI_DOCS_URL)}>
        <CircleHelp size={16} />
      </IconButton>
    </footer>
  )
}
