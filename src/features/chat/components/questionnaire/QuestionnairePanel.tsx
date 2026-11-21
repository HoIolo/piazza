import { useEffect, useRef, useState } from 'react'
import type { Question, QuestionAnswer } from '@/shared/utils/questionnaire'
import { EMPTY_DRAFT, isAnswered, toggleDraft, withCustom, type Draft } from './draft'
import { useQuestionnaireKeys } from './useQuestionnaireKeys'
import { QuestionBody } from './QuestionBody'
import styles from './QuestionnairePanel.module.css'

export interface QuestionnairePanelProps {
  questions: Question[]
  onSubmit: (answers: QuestionAnswer[]) => void
  onDismiss: () => void
}

/**
 * 提问面板，对齐 ChatGPT/Codex 的 request_input 卡片：
 *
 * - 一屏一题，题干即标题，右侧「‹ n of m › ✕」
 * - 选项是编号方块 + 标签（可带「推荐」）+ 描述，悬停才出箭头
 * - 最后一行是铅笔图标的自填行，右侧常驻「跳过」
 * - 单选选中即进下一题；多选要显式点提交（否则勾第二个就交了）
 * - 键盘：1-9 直选、↑↓ 移动、←→ 翻页、Enter 继续、Esc 关闭
 */
export function QuestionnairePanel({ questions, onSubmit, onDismiss }: QuestionnairePanelProps) {
  const [index, setIndex] = useState(0)
  const [drafts, setDrafts] = useState<Draft[]>(() => questions.map(() => EMPTY_DRAFT))
  const [cursor, setCursor] = useState(0)
  const customRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const question = questions[index]
  const draft = drafts[index] ?? EMPTY_DRAFT
  const total = questions.length
  const last = index === total - 1
  const multi = question.multiSelect === true

  const updateDraft = (next: Partial<Draft>): Draft[] => {
    const updated = drafts.map((item, i) => (i === index ? { ...item, ...next } : item))
    setDrafts(updated)
    return updated
  }

  const submit = (list: Draft[] = drafts) =>
    onSubmit(
      list.map((item, i) => {
        const custom = item.custom.trim()
        return {
          index: i,
          selected: custom ? [] : item.selected,
          custom: custom || undefined,
        }
      }),
    )

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), total - 1)
    if (clamped === index) return
    setIndex(clamped)
    setCursor(0)
  }

  const advance = (list: Draft[] = drafts) => {
    if (last) submit(list)
    else goTo(index + 1)
  }

  /** 点选项：单选立刻进下一题（对齐 Codex 的「选了就走」） */
  const pick = (label: string) => {
    const updated = updateDraft(toggleDraft(draft, label, multi))
    if (!multi) advance(updated)
  }

  useQuestionnaireKeys({
    rootRef,
    customRef,
    question,
    cursor,
    setCursor,
    total,
    index,
    goTo,
    pick,
    onDismiss,
    clearCustom: () => updateDraft({ custom: '' }),
  })

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  const submitLabel = last ? '提交' : '继续'

  return (
    <div
      ref={rootRef}
      className={styles.panel}
      role="dialog"
      aria-label={question.question}
      tabIndex={-1}
    >
      <QuestionBody
        question={question}
        draft={draft}
        cursor={cursor}
        index={index}
        total={total}
        submitLabel={submitLabel}
        customRef={customRef}
        onPick={pick}
        onCustom={(value) => updateDraft(withCustom(draft, value))}
        onSubmitCustom={() => advance()}
        onFocusCustom={() => setCursor(question.options.length)}
        onGoTo={goTo}
        onDismiss={onDismiss}
        onSkip={onDismiss}
      />
      {/* 单选选中即走，只有多选需要一颗显式的提交按钮 */}
      {multi && (
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.submit}
            disabled={!isAnswered(draft)}
            onClick={() => advance()}
          >
            {submitLabel}
            <kbd className={styles.kbd}>⏎</kbd>
          </button>
        </div>
      )}
    </div>
  )
}
