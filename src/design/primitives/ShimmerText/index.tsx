import type { ReactNode } from 'react'
import styles from './ShimmerText.module.css'

export interface ShimmerTextProps {
  children: ReactNode
  /** 为假时退回静态文字，供「进行中 → 已完成」原地切换 */
  active?: boolean
}

/**
 * 进行中的文字：一道高光自左向右扫过。
 *
 * 用背景渐变 + background-clip: text 实现，而不是改变整段文字的透明度——
 * 后者会让整行一起明灭，读起来像在闪烁；扫光只强调「还在动」。
 */
export function ShimmerText({ children, active = true }: ShimmerTextProps) {
  return (
    <span
      className={styles.text}
      data-active={active}
      data-loading-anim={active ? 'shimmer' : undefined}
    >
      {children}
    </span>
  )
}
