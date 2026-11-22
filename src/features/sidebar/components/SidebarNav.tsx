import { ComposeIcon, PackageIcon } from '@/design/icons'
import { shortcut } from '@/shared/utils/platform'
import styles from './SidebarNav.module.css'

export interface SidebarNavProps {
  onNewChat: () => void
  onOpenPackages: () => void
}

/**
 * 侧栏固定导航区。
 *
 * Codex 原版还有「拉取请求」「已安排」两项，pi 没有对应能力，故不列出——
 * 点不动的入口比没有这个入口更让人困惑。「插件」对应 pi 的扩展包，
 * 指向设置里的同名分区。
 */
export function SidebarNav({ onNewChat, onOpenPackages }: SidebarNavProps) {
  const items = [
    { icon: ComposeIcon, label: '新对话', hint: shortcut('N'), onClick: onNewChat },
    { icon: PackageIcon, label: '扩展包', hint: null, onClick: onOpenPackages },
  ]

  return (
    <nav className={styles.nav}>
      {items.map(({ icon: Icon, label, hint, onClick }) => (
        <button key={label} type="button" className={styles.item} onClick={onClick} title={label}>
          {/*
            16px 而不是图标默认的 20px：项目行图标也是 16px，这样两条导航的
            文字才和项目名、会话标题落在同一条 40px 的竖线上。用默认值时
            文字被推到 44px，比下面所有文案都多出 4px。
          */}
          <Icon size={16} className={styles.icon} />
          <span className={styles.label}>{label}</span>
          {hint && <kbd className={styles.hint}>{hint}</kbd>}
        </button>
      ))}
    </nav>
  )
}
