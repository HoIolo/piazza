import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import styles from './UserMessage.module.css'

export interface UserEditFormProps {
  initialText: string
  hasAttachments: boolean
  onCancel: () => void
  onSubmit: (nextText: string) => Promise<void>
}

/** 用户消息原位编辑表单：对齐 Codex y5H2，支持 Enter 提交与 Esc 取消。 */
export function UserEditForm({
  initialText,
  hasAttachments,
  onCancel,
  onSubmit,
}: UserEditFormProps) {
  const [draft, setDraft] = useState(initialText)
  const [submitting, setSubmitting] = useState(false)
  const ime = useImeGuard()
  const canSend = !submitting && (draft.trim().length > 0 || hasAttachments)

  const submit = async () => {
    if (!canSend) return
    setSubmitting(true)
    await onSubmit(draft)
    setSubmitting(false)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ime.isComposing(event)) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <form className={styles.editForm} onSubmit={handleSubmit}>
      <textarea
        className={styles.editInput}
        aria-label="编辑消息"
        placeholder="编辑消息"
        rows={Math.min(10, Math.max(2, draft.split('\n').length))}
        value={draft}
        autoFocus
        disabled={submitting}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        {...ime.bind}
      />
      <div className={styles.editFooter}>
        <button type="button" className={styles.cancelBtn} disabled={submitting} onClick={onCancel}>
          取消
        </button>
        <button type="submit" className={styles.sendBtn} disabled={!canSend}>
          发送
        </button>
      </div>
    </form>
  )
}
