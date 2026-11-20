import { useState } from 'react'
import { FileText, X, ArrowDownLeft } from 'lucide-react'
import type { DraftAttachment } from '@/shared/api/attachments'
import { FilePreviewDialog } from '@/shared/components/FilePreviewDialog'
import { ImagePreview } from '@/shared/components/ImagePreview'
import { imageSource } from '@/shared/utils/image'
import styles from './AttachmentTray.module.css'

export function AttachmentTray({
  files,
  reading,
  remove,
  restoreText,
}: {
  files: DraftAttachment[]
  reading: boolean
  remove: (id: string) => void
  restoreText: (file: DraftAttachment) => void
}) {
  const [preview, setPreview] = useState<DraftAttachment | null>(null)
  if (!files.length && !reading) return null
  return (
    <div className={styles.tray} aria-label="消息附件">
      {files.map((file) => (
        <div key={file.id} className={styles.attachment} data-image={Boolean(file.image)}>
          {file.image ? (
            <ImagePreview src={imageSource(file.image)} alt={file.name} />
          ) : (
            <button
              type="button"
              className={styles.file}
              onClick={() => setPreview(file)}
              title={file.path ?? file.name}
            >
              <FileText size={24} />
              <span>
                <strong>{file.name}</strong>
                <small>
                  {file.text !== undefined
                    ? `${file.text.length.toLocaleString()} 字符`
                    : formatSize(file.size)}
                </small>
              </span>
            </button>
          )}
          <button
            type="button"
            className={styles.remove}
            onClick={() => remove(file.id)}
            aria-label={`移除附件：${file.name}`}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {reading && <span role="status">正在添加附件…</span>}
      {preview && (
        <AttachmentDetail
          file={preview}
          close={() => setPreview(null)}
          restore={() => {
            restoreText(preview)
            setPreview(null)
          }}
        />
      )}
    </div>
  )
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(bytes / 1024))} KB`
}

function AttachmentDetail({
  file,
  close,
  restore,
}: {
  file: DraftAttachment
  close: () => void
  restore: () => void
}) {
  return (
    <FilePreviewDialog
      title={file.name}
      text={file.text ?? file.path ?? ''}
      close={close}
      footer={
        file.text !== undefined ? (
          <button type="button" className={styles.restore} onClick={restore}>
            <ArrowDownLeft size={14} />
            在输入框中显示
          </button>
        ) : undefined
      }
    />
  )
}
