import type { ReactNode } from 'react'
import styles from './Card.module.css'

export interface CardProps {
  children: ReactNode
  /** 卡片上方的分组标题，如「权限」「常规」 */
  title?: string
}

/** 设置页的分组卡片容器 */
export function Card({ children, title }: CardProps) {
  return (
    <section className={styles.section}>
      {title && <h2 className={styles.title}>{title}</h2>}
      <div className={styles.card}>{children}</div>
    </section>
  )
}
