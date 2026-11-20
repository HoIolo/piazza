import { useState } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { userText } from '@/shared/utils/message'
import { useChatStore } from '@/store/chat'
import styles from './SideChat.module.css'

function parentExcerpt() {
  const messages = useChatStore.getState().messages
  const excerpt = messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-4)
    .map((message) => {
      if (message.role === 'user') return `提问：${userText(message).slice(-1500)}`
      if (message.role !== 'assistant') return ''
      const text = message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n')
      return text ? `回答：${text.slice(-1500)}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
  return excerpt
}

export function SideComposer({
  blocked,
  running,
  onSend,
  onStop,
}: {
  blocked: boolean
  running: boolean
  onSend: (message: string) => Promise<boolean>
  onStop: () => Promise<boolean>
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const ime = useImeGuard()
  const hasParentMessages = useChatStore((state) =>
    state.messages.some((message) => message.role === 'user'),
  )

  const quote = () => {
    const excerpt = parentExcerpt()
    if (excerpt)
      setDraft((current) =>
        [current.trim(), `主对话摘录：\n\n${excerpt}\n`].filter(Boolean).join('\n\n'),
      )
  }

  const submit = async () => {
    if (!draft.trim() || blocked || running || sending) return
    setSending(true)
    const sent = await onSend(draft.trim())
    if (sent) setDraft((current) => (current === draft ? '' : current))
    setSending(false)
  }

  return (
    <div>
      {hasParentMessages && (
        <button type="button" className={styles.quote} onClick={quote}>
          引用主对话
        </button>
      )}
      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <textarea
          rows={2}
          aria-label="侧边聊天消息"
          placeholder="发送消息"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || ime.isComposing(event)) return
            event.preventDefault()
            void submit()
          }}
          {...ime.bind}
        />
        {running ? (
          <button type="button" aria-label="停止侧边聊天" onClick={() => void onStop()}>
            <Square size={14} />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="发送侧边聊天消息"
            disabled={blocked || sending || !draft.trim()}
          >
            <ArrowUp size={18} />
          </button>
        )}
      </form>
    </div>
  )
}
