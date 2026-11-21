import { useEffect, type RefObject } from 'react'
import { Pencil } from 'lucide-react'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import styles from './QuestionnairePanel.module.css'

export interface CustomRowProps {
  value: string
  active: boolean
  submitLabel: string
  customRef: RefObject<HTMLTextAreaElement | null>
  onFocus: () => void
  onChange: (value: string) => void
  onSubmit: () => void
  onSkip: () => void
}

/**
 * 自填行（对齐截图里的「其他」行）：铅笔图标 + 可长高的文本域，
 * 右侧空时为「跳过」，有内容时切换为「提交/继续」；Enter 提交，Shift+Enter 换行。
 */
export function CustomRow({
  value,
  active,
  submitLabel,
  customRef,
  onFocus,
  onChange,
  onSubmit,
  onSkip,
}: CustomRowProps) {
  const ime = useImeGuard()
  const hasText = value.trim().length > 0

  useEffect(() => {
    if (!value && customRef.current) customRef.current.style.height = ''
  }, [value, customRef])

  return (
    <div
      className={styles.other}
      data-cursor={active}
      onMouseDown={(event) => {
        if (
          event.target === customRef.current ||
          (event.target instanceof Element && event.target.closest('button'))
        )
          return
        event.preventDefault()
        customRef.current?.focus()
      }}
    >
      <Pencil size={14} className={styles.otherIcon} aria-hidden="true" />
      <textarea
        ref={customRef}
        className={styles.custom}
        rows={1}
        value={value}
        placeholder="否，并告诉我应该怎么做得不同"
        aria-label="自定义回答"
        onFocus={onFocus}
        onChange={(event) => {
          const next = event.target.value
          const node = event.currentTarget
          node.style.height = 'auto'
          node.style.height = next ? `${node.scrollHeight}px` : ''
          onChange(next)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || ime.isComposing(event)) return
          event.preventDefault()
          if (hasText) onSubmit()
        }}
        {...ime.bind}
      />
      <button
        type="button"
        className={hasText ? styles.send : styles.skip}
        onClick={(event) => {
          event.stopPropagation()
          if (hasText) onSubmit()
          else onSkip()
        }}
      >
        {hasText ? submitLabel : '跳过'}
      </button>
    </div>
  )
}
