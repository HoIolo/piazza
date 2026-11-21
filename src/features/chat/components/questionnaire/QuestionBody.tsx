import type { Question } from '@/shared/utils/questionnaire'
import type { Draft } from './draft'
import { CustomRow } from './CustomRow'
import { OptionRow } from './OptionRow'
import { QuestionHead } from './QuestionHead'
import styles from './QuestionnairePanel.module.css'

export interface QuestionBodyProps {
  question: Question
  draft: Draft
  cursor: number
  index: number
  total: number
  submitLabel: string
  customRef: React.RefObject<HTMLTextAreaElement | null>
  onPick: (label: string) => void
  onCustom: (value: string) => void
  onSubmitCustom: () => void
  onFocusCustom: () => void
  onGoTo: (next: number) => void
  onDismiss: () => void
  onSkip: () => void
}

/** 一屏一题：标题行 + 编号选项 + 自填行 */
export function QuestionBody({
  question,
  draft,
  cursor,
  index,
  total,
  submitLabel,
  customRef,
  onPick,
  onCustom,
  onSubmitCustom,
  onFocusCustom,
  onGoTo,
  onDismiss,
  onSkip,
}: QuestionBodyProps) {
  const multi = question.multiSelect === true
  const customRow = question.options.length

  return (
    <>
      <QuestionHead
        title={question.question}
        index={index}
        total={total}
        onGoTo={onGoTo}
        onDismiss={onDismiss}
      />
      <div
        className={styles.body}
        role={multi ? 'group' : 'radiogroup'}
        aria-label={question.question}
      >
        {question.options.map((option, optionIndex) => (
          <OptionRow
            key={option.label}
            option={option}
            index={optionIndex}
            multi={multi}
            checked={draft.selected.includes(option.label)}
            active={cursor === optionIndex}
            onPick={onPick}
          />
        ))}
        <CustomRow
          value={draft.custom}
          active={cursor === customRow}
          submitLabel={submitLabel}
          customRef={customRef}
          onFocus={onFocusCustom}
          onChange={onCustom}
          onSubmit={onSubmitCustom}
          onSkip={onSkip}
        />
      </div>
    </>
  )
}
