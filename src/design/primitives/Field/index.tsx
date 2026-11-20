import type { ReactNode } from 'react'
import styles from './Field.module.css'

export interface FieldProps {
  label: string
  children: ReactNode
  /** 控件下方的一句说明 */
  hint?: ReactNode
  /** 标签与控件左右排（开关、分段控件这类窄控件） */
  inline?: boolean
}

/**
 * 表单字段：标签 + 控件 + 说明。
 *
 * 不用 label 元素包控件：分段控件是一组按钮，label 的点击会转发给第一个按钮，
 * 点标签文字就等于选了第一档。无障碍名称由各控件的 ariaLabel 自己给。
 */
export function Field({ label, children, hint, inline = false }: FieldProps) {
  return (
    <div className={styles.field} data-inline={inline}>
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}
