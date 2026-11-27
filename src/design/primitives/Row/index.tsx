import type { ReactNode } from 'react'
import styles from './Row.module.css'

export interface RowProps {
  title: ReactNode
  /** 副标题说明，可含链接等富文本 */
  description?: ReactNode
  /** 右侧控件：开关、下拉、分段控件等 */
  control?: ReactNode
  /** 控件另起一行占满宽度（用于输入框、表格等较宽的内容） */
  stacked?: boolean
}

/** 设置卡片内的一行。行间分隔线由 CSS 相邻选择器绘制，避免手工传 isLast */
export function Row({ title, description, control, stacked = false }: RowProps) {
  return (
    <div className={styles.row} data-stacked={stacked}>
      <div className={styles.main}>
        <div className={styles.text}>
          <div className={styles.title}>{title}</div>
          {description && <div className={styles.description}>{description}</div>}
        </div>
        {!stacked && control && <div className={styles.control}>{control}</div>}
      </div>
      {stacked && control && <div className={styles.stackedControl}>{control}</div>}
    </div>
  )
}
