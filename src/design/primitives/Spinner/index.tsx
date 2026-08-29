import styles from './Spinner.module.css'

export interface SpinnerProps {
  size?: number
  /** 无障碍描述，如「正在保存」 */
  ariaLabel?: string
}

/** 环形加载指示器，用于按钮内与小面积等待场景 */
export function Spinner({ size = 14, ariaLabel = '加载中' }: SpinnerProps) {
  return (
    <span
      className={styles.spinner}
      role="status"
      aria-label={ariaLabel}
      data-loading-anim="spinner"
      style={{ width: size, height: size, borderWidth: Math.max(1.5, size / 9) }}
    />
  )
}
