import styles from './Skeleton.module.css'

export interface SkeletonProps {
  /** CSS 宽度值，如 "60%"、"120px" */
  width?: string
  height?: string
  /** 圆形（头像/图标占位） */
  circle?: boolean
}

/** 骨架屏占位块。比 loading 文案更接近最终布局，减少内容到位时的跳动感 */
export function Skeleton({ width = '100%', height = '14px', circle = false }: SkeletonProps) {
  return (
    <span
      className={styles.skeleton}
      data-circle={circle}
      data-loading-anim="skeleton"
      style={{ width, height }}
      aria-hidden
    />
  )
}
