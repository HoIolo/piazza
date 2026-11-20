import { useEffect, useId, type ReactNode } from 'react'
import { Pill } from '../Pill'
import { Spinner } from '../Spinner'
import styles from './Dialog.module.css'

export interface DialogProps {
  title: string
  children: ReactNode
  onClose: () => void
  onConfirm: () => void
  confirmLabel?: string
  /** 确认进行中：按钮出转圈并锁住，避免重复提交 */
  busy?: boolean
}

/**
 * 表单对话框：标题 + 表单正文 + 「取消 / 确认」。
 *
 * 正文包在 form 里，输入框内按 Enter 即确认；Esc 与点遮罩关闭。
 * 只做这一种形态——应用里的模态全是「填一张小表再确认」，通用弹层没有第二个用处。
 */
export function Dialog({
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = '保存',
  busy = false,
}: DialogProps) {
  const titleId = useId()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 只关自己：不让这次 Esc 再冒到 window 上把整个设置视图也关掉
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) onConfirm()
        }}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <div className={styles.body}>{children}</div>
        <footer className={styles.footer}>
          <Pill onClick={onClose} disabled={busy}>
            取消
          </Pill>
          <Pill
            type="submit"
            variant="primary"
            disabled={busy}
            icon={busy ? <Spinner size={13} ariaLabel="正在保存" /> : undefined}
          >
            {confirmLabel}
          </Pill>
        </footer>
      </form>
    </div>
  )
}
