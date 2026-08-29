import type { ReactNode } from 'react'
import styles from './IconButton.module.css'

export interface IconButtonProps {
  children: ReactNode
  onClick?: () => void
  ariaLabel: string
  /** 24px 紧凑 / 28px 常规 */
  size?: 'sm' | 'md'
  active?: boolean
  title?: string
}

/** 纯图标按钮，用于标题栏与工具条 */
export function IconButton({
  children,
  onClick,
  ariaLabel,
  size = 'md',
  active = false,
  title,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      data-size={size}
      data-active={active}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={title ?? ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
