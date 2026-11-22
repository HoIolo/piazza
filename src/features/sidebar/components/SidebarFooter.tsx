import { openUrl } from '@tauri-apps/plugin-opener'
import { BookOpen, CircleHelp, RefreshCw, Settings } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { shortcut } from '@/shared/utils/platform'
import { useAppStore } from '@/store/app.store'
import styles from './SidebarFooter.module.css'

const APP_NAME = 'Piazza'
const README_URL = 'https://github.com/HoIolo/piazza#readme'

export interface SidebarFooterProps {
  onOpenSettings: () => void
}

/** 侧栏底部的应用菜单入口 */
export function SidebarFooter({ onOpenSettings }: SidebarFooterProps) {
  const checkForUpdates = useAppStore((s) => s.check)

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
            <span className={styles.name}>{APP_NAME}</span>
          </button>
        )}
      >
        {(close) => (
          <div className={styles.menu}>
            <div className={styles.menuTitle}>{APP_NAME}</div>
            <MenuSeparator />
            <MenuItem
              icon={<Settings size={16} />}
              hint={shortcut(',')}
              onClick={() => {
                onOpenSettings()
                close()
              }}
            >
              设置
            </MenuItem>
            <MenuItem
              icon={<RefreshCw size={16} />}
              onClick={() => {
                void checkForUpdates()
                close()
              }}
            >
              检查更新
            </MenuItem>
            <MenuItem
              icon={<BookOpen size={16} />}
              onClick={() => {
                void openUrl(README_URL)
                close()
              }}
            >
              GitHub README
            </MenuItem>
          </div>
        )}
      </Popover>

      <IconButton ariaLabel="打开 GitHub README" size="sm" onClick={() => void openUrl(README_URL)}>
        <CircleHelp size={16} />
      </IconButton>
    </footer>
  )
}
