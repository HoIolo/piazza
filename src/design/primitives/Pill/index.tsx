import type { ReactNode } from 'react'
import styles from './Pill.module.css'

export interface PillProps {
  children: ReactNode
  onClick?: () => void
  /** outlined 带描边（如「审核」「打开位置」），ghost 无描边纯文字 */
  variant?: 'outlined' | 'ghost'
  icon?: ReactNode
  ariaLabel?: string
}

/** 胶囊型按钮 */
export function Pill({ children, onClick, variant = 'outlined', icon, ariaLabel }: PillProps) {
  return (
    <button
      type="button"
      className={styles.pill}
      data-variant={variant}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </button>
  )
}
