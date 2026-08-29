import { Search } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import styles from './SidebarHeader.module.css'

export interface SidebarHeaderProps {
  onSearch: () => void
}

/**
 * 侧栏顶部。整块是窗口拖拽区（data-tauri-drag-region），
 * 左侧留白给 macOS 交通灯——位置由 tauri.conf.json 的 trafficLightPosition 决定。
 *
 * 品牌名只是标识，不带下拉：原来挂在这儿的「设置 / 文档」已挪到左下角，
 * 那里才是 Codex 放账号与设置入口的位置。
 * Codex 原版右上角还有通知铃铛，pi 没有通知机制，故不保留。
 */
export function SidebarHeader({ onSearch }: SidebarHeaderProps) {
  return (
    <>
      <div className={styles.dragZone} data-tauri-drag-region />
      <header className={styles.header}>
        <span className={styles.brandName}>PI-Codex</span>

        <div className={styles.actions}>
          <IconButton ariaLabel="搜索" onClick={onSearch}>
            <Search size={17} />
          </IconButton>
        </div>
      </header>
    </>
  )
}
