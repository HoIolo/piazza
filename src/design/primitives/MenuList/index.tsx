import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './MenuList.module.css'

export interface MenuItemProps {
  icon?: ReactNode
  children: ReactNode
  /** 右侧说明或快捷键 */
  hint?: ReactNode
  selected?: boolean
  disabled?: boolean
  /** danger 整行变红，给删除这类不可逆动作 */
  tone?: 'default' | 'danger'
  onClick?: () => void
}

/** 浮层里的一行。选中态用右侧对勾，与 Codex 一致 */
export function MenuItem({
  icon,
  children,
  hint,
  selected = false,
  disabled = false,
  tone = 'default',
  onClick,
}: MenuItemProps) {
  return (
    <button
      type="button"
      className={styles.item}
      role="menuitem"
      data-tone={tone}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
      {selected && <Check size={15} className={styles.check} />}
    </button>
  )
}

/** 分组标题 */
export function MenuGroupLabel({ children }: { children: ReactNode }) {
  return <div className={styles.groupLabel}>{children}</div>
}

export function MenuSeparator() {
  return <div className={styles.separator} role="separator" />
}

export function MenuEmpty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}>{children}</div>
}
