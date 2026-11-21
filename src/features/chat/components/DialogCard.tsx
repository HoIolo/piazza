import { useState } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import type { ExtensionUiDialog } from '@/rpc/types'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { encodeAnswers, parseQuestionnaire, type Question } from '@/shared/utils/questionnaire'
import { QuestionnairePanel } from './questionnaire/QuestionnairePanel'
import styles from './DialogCard.module.css'

export interface DialogCardProps {
  dialog: ExtensionUiDialog
  onAnswer: (payload: { value?: string; confirmed?: boolean; cancelled?: boolean }) => void
}

/** select：编号选项列表，与 Codex 的提问卡片一致 */
function SelectBody({ options, onPick }: { options: string[]; onPick: (v: string) => void }) {
  return (
    <>
      {options.map((option, index) => (
        <button key={option} type="button" className={styles.option} onClick={() => onPick(option)}>
          <span className={styles.index}>{index + 1}</span>
          <span className={styles.optionText}>{option}</span>
          <ChevronRight aria-hidden="true" size={16} className={styles.go} />
        </button>
      ))}
    </>
  )
}

/** confirm：是/否两个按钮 */
function ConfirmBody({ onConfirm }: { onConfirm: (v: boolean) => void }) {
  return (
    <div className={styles.confirmRow}>
      <button type="button" className={styles.primary} onClick={() => onConfirm(true)}>
        确认
      </button>
      <button type="button" className={styles.secondary} onClick={() => onConfirm(false)}>
        取消
      </button>
    </div>
  )
}

/** input / editor：自由文本 */
function TextBody({
  multiline,
  placeholder,
  prefill,
  onSubmit,
}: {
  multiline: boolean
  placeholder?: string
  prefill?: string
  onSubmit: (v: string) => void
}) {
  const [value, setValue] = useState(prefill ?? '')
  const ime = useImeGuard()
  const submit = () => {
    if (value.trim()) onSubmit(value)
  }

  return (
    <div className={styles.textBody}>
      {multiline ? (
        <textarea
          className={styles.textarea}
          value={value}
          placeholder={placeholder}
          rows={5}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
      ) : (
        <input
          className={styles.input}
          value={value}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !ime.isComposing(e) && submit()}
          {...ime.bind}
        />
      )}
      <button type="button" className={styles.primary} disabled={!value.trim()} onClick={submit}>
        提交
      </button>
    </div>
  )
}

/**
 * 扩展索取用户输入时的卡片，贴住输入框上方。
 * pi 的四种对话方法在这里各自呈现，但共用同一套外框与关闭行为。
 */
/** 四种对话方法各自的正交渲染 */
function MethodBody({
  dialog,
  onAnswer,
}: {
  dialog: ExtensionUiDialog
  onAnswer: DialogCardProps['onAnswer']
}) {
  switch (dialog.method) {
    case 'select':
      return <SelectBody options={dialog.options} onPick={(value) => onAnswer({ value })} />
    case 'confirm':
      return <ConfirmBody onConfirm={(confirmed) => onAnswer({ confirmed })} />
    case 'input':
      return (
        <TextBody
          multiline={false}
          placeholder={dialog.placeholder}
          onSubmit={(value) => onAnswer({ value })}
        />
      )
    case 'editor':
      return (
        <TextBody multiline prefill={dialog.prefill} onSubmit={(value) => onAnswer({ value })} />
      )
  }
}

/** 只有 select 可能是结构化问卷；其余方法没有标题承载题目 */
function questionnaireOf(dialog: ExtensionUiDialog): Question[] | null {
  return dialog.method === 'select' ? parseQuestionnaire(dialog.title) : null
}

/**
 * 结构化问卷的包装：把面板的作答编码回 select 的 value。
 * 单独一层是为了让 DialogCard 自己只管「四种基础方法」的分派。
 */
function QuestionnaireCard({
  questions,
  onAnswer,
}: {
  questions: Question[]
  onAnswer: DialogCardProps['onAnswer']
}) {
  return (
    <QuestionnairePanel
      questions={questions}
      onSubmit={(answers) => onAnswer({ value: encodeAnswers(answers) })}
      onDismiss={() => onAnswer({ cancelled: true })}
    />
  )
}

export function DialogCard({ dialog, onAnswer }: DialogCardProps) {
  /*
   * 结构化问卷走 Codex 的面板；认不出标记的 select 还是原来那串编号选项，
   * 老扩展（或别的扩展）的 select 用法不受影响。
   */
  const questions = questionnaireOf(dialog)
  if (questions) return <QuestionnaireCard questions={questions} onAnswer={onAnswer} />

  return (
    <div className={styles.card} role="dialog" aria-label={dialog.title ?? '需要你的输入'}>
      <header className={styles.head}>
        <Check className={styles.questionIcon} aria-hidden="true" size={16} />
        <h4 className={styles.title}>{dialog.title ?? '需要你的输入'}</h4>
        <button
          type="button"
          className={styles.close}
          onClick={() => onAnswer({ cancelled: true })}
          aria-label="跳过提问"
          title="跳过提问"
        >
          <X size={16} />
        </button>
      </header>

      {dialog.message && <p className={styles.message}>{dialog.message}</p>}

      <MethodBody dialog={dialog} onAnswer={onAnswer} />
    </div>
  )
}
