import { ArrowRight } from 'lucide-react'
import type { QuestionOption } from '@/shared/utils/questionnaire'
import styles from './QuestionnairePanel.module.css'

export interface OptionRowProps {
  option: QuestionOption
  index: number
  multi: boolean
  checked: boolean
  /** 键盘光标所在行：与悬停同底色，编号方块反色 */
  active: boolean
  onPick: (label: string) => void
}

/**
 * 一行选项，对齐 Codex 的 request_choice：
 * 20px 编号方块 + 标签（可带「推荐」徽标）+ 描述 + 悬停才出现的箭头。
 * 单题多选项时才显示编号，只有一项时 Codex 会省掉序号，这里同样。
 */
export function OptionRow({ option, index, multi, checked, active, onPick }: OptionRowProps) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={checked}
      className={styles.option}
      data-cursor={active}
      data-checked={checked}
      onClick={() => onPick(option.label)}
    >
      <span className={styles.marker} aria-hidden="true">
        {multi && checked ? '✓' : index + 1}
      </span>
      <span className={styles.optionText}>
        <span className={styles.labelRow}>
          <span className={styles.label}>{option.label}</span>
          {option.recommended && <span className={styles.badge}>推荐</span>}
        </span>
        {option.description && <span className={styles.desc}>{option.description}</span>}
      </span>
      <ArrowRight size={15} className={styles.go} aria-hidden="true" />
    </button>
  )
}
