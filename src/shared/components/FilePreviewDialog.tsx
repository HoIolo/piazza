import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useModalDialog } from '@/shared/hooks/useModalDialog'
import styles from './FilePreviewDialog.module.css'

export function FilePreviewDialog({
  title,
  text,
  close,
  footer,
}: {
  title: string
  text: string
  close: () => void
  footer?: ReactNode
}) {
  const modal = useModalDialog(close)
  return (
    <dialog {...modal} className={styles.dialog} aria-label={title}>
      <header>
        <strong>{title}</strong>
        <button type="button" aria-label="关闭文件预览" onClick={close}>
          <X size={18} />
        </button>
      </header>
      <pre className="selectable">{text}</pre>
      {footer}
    </dialog>
  )
}
