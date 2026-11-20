import { PanelLeftIcon, SearchIcon } from '@/design/icons'
import { IconButton } from '@/design/primitives/IconButton'
import styles from './SidebarHeader.module.css'

export interface SidebarHeaderProps {
  onSearch: () => void
  onToggleSidebar: () => void
}

/**
 * 侧栏顶部，与主区顶栏同高，合起来就是一整条窗口标题栏。
 *
 * 整条是窗口拖拽区；左边空着给 macOS 交通灯（位置见 tauri.conf.json 的
 * trafficLightPosition），按钮靠右。Codex 这里没有品牌字标——应用名已经在
 * 系统菜单栏和程序坞里，标题栏再写一遍只是占地方。
 */
export function SidebarHeader({ onSearch, onToggleSidebar }: SidebarHeaderProps) {
  return (
    <header className={styles.header} data-tauri-drag-region>
      <div className={styles.actions}>
        <IconButton ariaLabel="搜索" title="搜索（⌘K）" onClick={onSearch}>
          <SearchIcon />
        </IconButton>
        <IconButton ariaLabel="收起侧栏" title="收起侧栏（⌘B）" onClick={onToggleSidebar}>
          <PanelLeftIcon />
        </IconButton>
      </div>
    </header>
  )
}
