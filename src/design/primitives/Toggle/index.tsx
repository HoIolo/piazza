import styles from './Toggle.module.css'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** 无障碍名称。视觉标签通常由外层 Row 提供，此处仅供读屏使用 */
  ariaLabel?: string
}

/** iOS 风格开关，尺寸对齐 macOS 设置面板 */
export function Toggle({ checked, onChange, disabled = false, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={styles.track}
      data-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  )
}
