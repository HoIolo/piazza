import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import styles from './QuestionnairePanel.module.css'

export interface QuestionHeadProps {
  title: string
  index: number
  total: number
  onGoTo: (next: number) => void
  onDismiss: () => void
}

/**
 * 标题行：左侧题干，右侧「‹ n of m ›」翻页器与关闭按钮。
 *
 * 对齐 Codex 的 request_input 卡片头：题干就是标题，不再另起一行重复；
 * 单题时不显示翻页器与页码。
 */
export function QuestionHead({ title, index, total, onGoTo, onDismiss }: QuestionHeadProps) {
  const last = index === total - 1
  return (
    <header className={styles.head}>
      <p className={styles.title}>{title}</p>
      <div className={styles.headActions}>
        {total > 1 && (
          <div className={styles.pager}>
            <button
              type="button"
              className={styles.iconBtn}
              disabled={index === 0}
              aria-label="上一题"
              onClick={() => onGoTo(index - 1)}
            >
              <ChevronLeft size={14} />
            </button>
            <span className={styles.count}>
              {index + 1} of {total}
            </span>
            <button
              type="button"
              className={styles.iconBtn}
              disabled={last}
              aria-label="下一题"
              onClick={() => onGoTo(index + 1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          aria-label="关闭提问"
          title="关闭（Esc）"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  )
}
