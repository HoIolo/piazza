import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { FilePreviewDialog } from './FilePreviewDialog'
import { WorkspaceFileIcon } from '@/design/icons/CodexIcon'
import { openLink } from '@/shared/utils/openLink'
import type { PromptAttachment } from '@/shared/utils/promptAttachments'
import styles from './MessageFiles.module.css'

export function MessageFiles({ files }: { files: PromptAttachment[] }) {
  const [preview, setPreview] = useState<PromptAttachment | null>(null)
  return (
    <>
      {files.length > 0 && (
        <div className={styles.files}>
          {files.map((file, index) => (
            <button key={index} type="button" onClick={() => setPreview(file)}>
              <WorkspaceFileIcon size={20} />
              <span>
                {file.name}
                <small>{file.path ? '文件' : `${file.content.length.toLocaleString()} 字符`}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {preview && <FileDialog file={preview} close={() => setPreview(null)} />}
    </>
  )
}

function FileDialog({ file, close }: { file: PromptAttachment; close: () => void }) {
  const [error, setError] = useState('')
  return (
    <FilePreviewDialog
      title={file.name}
      text={file.content}
      close={close}
      footer={
        <>
          {file.path && (
            <button
              type="button"
              className={styles.open}
              onClick={() => {
                void openLink(file.path ?? '', null).catch(() => setError('无法打开此文件'))
              }}
            >
              <ExternalLink size={14} />
              打开文件
            </button>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      }
    />
  )
}
