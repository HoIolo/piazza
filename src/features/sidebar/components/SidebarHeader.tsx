import { PanelLeftIcon, SearchIcon } from '@/design/icons'
import { IconButton } from '@/design/primitives/IconButton'
import { isMac, shortcut } from '@/shared/utils/platform'
import styles from './SidebarHeader.module.css'

export interface SidebarHeaderProps {
  onSearch: () => void
  onToggleSidebar: () => void
}

/**
 * 侧栏顶部，与主区顶栏同高，合起来就是一整条窗口标题栏。
 *
 * 整条是窗口拖拽区。macOS 左边空着给交通灯（位置见 tauri.macos.conf.json 的
 * trafficLightPosition），按钮靠右；Windows 右上角是自绘的窗口按钮，
 * 左上角空着没有道理，正好放品牌字标——和系统里其他应用把标题写在左上一致。
 */
export function SidebarHeader({ onSearch, onToggleSidebar }: SidebarHeaderProps) {
  return (
    <header className={styles.header} data-tauri-drag-region="deep">
      {!isMac() && <span className={styles.wordmark}>Piazza</span>}
      <div className={styles.actions}>
        <IconButton ariaLabel="搜索" title={`搜索（${shortcut('K')}）`} onClick={onSearch}>
          <SearchIcon />
        </IconButton>
        <IconButton
          ariaLabel="收起侧栏"
          title={`收起侧栏（${shortcut('B')}）`}
          onClick={onToggleSidebar}
        >
          <PanelLeftIcon />
        </IconButton>
      </div>
    </header>
  )
}
