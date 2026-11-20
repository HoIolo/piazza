import type { ReactNode } from 'react'
import styles from './Pill.module.css'

export interface PillProps {
  children: ReactNode
  onClick?: () => void
  /**
   * outlined 带描边（如「审核」「打开位置」），ghost 无描边纯文字，
   * primary 深底反白，一个表单里只给主动作用
   */
  variant?: 'outlined' | 'ghost' | 'primary'
  icon?: ReactNode
  ariaLabel?: string
  disabled?: boolean
  /** submit 时由所在 form 触发，onClick 可省 */
  type?: 'button' | 'submit'
}

/** 胶囊型按钮 */
export function Pill({
  children,
  onClick,
  variant = 'outlined',
  icon,
  ariaLabel,
  disabled = false,
  type = 'button',
}: PillProps) {
  return (
    <button
      type={type}
      className={styles.pill}
      data-variant={variant}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </button>
  )
}
