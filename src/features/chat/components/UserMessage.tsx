import { useState } from 'react'
import { Check, Copy, Pencil } from 'lucide-react'
import type { ImageContent, UserMessage as UserMessageType } from '@/rpc/types'
import { MessageImages } from '@/shared/components/ImagePreview'
import { MessageFiles } from '@/shared/components/MessageFiles'
import { formatTimestamp } from '@/shared/utils/format'
import { userText } from '@/shared/utils/message'
import { formatPromptAttachments, splitPromptAttachments } from '@/shared/utils/promptAttachments'
import { useChatActions } from '@/store/chat'
import { UserEditForm } from './UserEditForm'
import styles from './UserMessage.module.css'

export interface UserMessageProps {
  message: UserMessageType
  userIndex?: number
  editable?: boolean
}

function UserMessageActions({
  timestamp,
  canEdit,
  canCopy,
  copied,
  onEdit,
  onCopy,
}: {
  timestamp?: number
  canEdit: boolean
  canCopy: boolean
  copied: boolean
  onEdit: () => void
  onCopy: () => void
}) {
  if (!canCopy && !canEdit) return null
  return (
    <div className={styles.actions}>
      {timestamp ? <time className={styles.time}>{formatTimestamp(timestamp)}</time> : null}
      {canEdit && (
        <button
          type="button"
          className={styles.action}
          onClick={onEdit}
          aria-label="编辑消息"
          title="编辑消息"
        >
          <Pencil size={13} />
        </button>
      )}
      {canCopy && (
        <button
          type="button"
          className={styles.action}
          onClick={onCopy}
          aria-label={copied ? '已复制' : '复制消息'}
          title={copied ? '已复制' : '复制消息'}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </div>
  )
}

function extractImages(content: UserMessageType['content']): ImageContent[] {
  if (typeof content === 'string') return []
  return content.filter((block): block is ImageContent => block.type === 'image')
}

/** 用户消息：右对齐的中性淡染圆角气泡，支持悬停复制与 Codex 式原位编辑分叉重发 */
export function UserMessage({ message, userIndex, editable = false }: UserMessageProps) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const { editUserMessage } = useChatActions()

  const rawText = userText(message)
  const { text, attachments } = splitPromptAttachments(rawText)
  const images = extractImages(message.content)
  const canEdit = editable && userIndex !== undefined && rawText.length > 0

  const copy = () => {
    if (!text) return
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const submitEdit = async (nextText: string) => {
    const combined = formatPromptAttachments(nextText, attachments)
    const ok = await editUserMessage(userIndex, rawText, combined, images)
    if (ok) setEditing(false)
  }

  return (
    <div className={styles.row}>
      <div className={styles.content} data-editing={editing}>
        <MessageImages images={images} />
        <MessageFiles files={attachments} />
        {editing ? (
          <UserEditForm
            initialText={text}
            hasAttachments={attachments.length > 0 || images.length > 0}
            onCancel={() => setEditing(false)}
            onSubmit={submitEdit}
          />
        ) : (
          text && <div className={`${styles.bubble} selectable`}>{text}</div>
        )}
      </div>
      {!editing && (
        <UserMessageActions
          timestamp={message.timestamp}
          canEdit={canEdit}
          canCopy={Boolean(text)}
          copied={copied}
          onEdit={() => setEditing(true)}
          onCopy={copy}
        />
      )}
    </div>
  )
}
