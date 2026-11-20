import type { ReactNode } from 'react'
import styles from './IconButton.module.css'

export interface IconButtonProps {
  children: ReactNode
  onClick?: () => void
  ariaLabel: string
  /** 24px 紧凑 / 28px 常规 */
  size?: 'sm' | 'md'
  active?: boolean
  disabled?: boolean
  title?: string
  /** danger 悬停变红，给删除这类不可逆动作 */
  tone?: 'default' | 'danger'
}

/** 纯图标按钮，用于标题栏与工具条 */
export function IconButton({
  children,
  onClick,
  ariaLabel,
  size = 'md',
  active = false,
  disabled = false,
  title,
  tone = 'default',
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      data-size={size}
      data-active={active}
      data-tone={tone}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={title ?? ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
