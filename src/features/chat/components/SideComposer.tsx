import { useState } from 'react'
import { ArrowUp, Plus, Square } from 'lucide-react'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { userText } from '@/shared/utils/message'
import { useChatStore } from '@/store/chat'
import { ModelPicker } from '@/shared/components/ModelPicker'
import { TrustPicker } from '@/shared/components/TrustPicker'
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

/**
 * 侧边聊天输入区。
 *
 * 结构与主输入区一致（Codex 也是同一个 composer）：上方输入，下方左侧是
 * 「+」与权限标记、右侧是模型选择与发送键。侧边聊天不带附件能力，所以
 * 「+」换成了「引用主对话」——它才是这里唯一需要的取材入口。
 */
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
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <textarea
        rows={1}
        aria-label="侧边聊天消息"
        /*
         * 「聊点别的」点明这是与主对话并行的另一条线，不是接着主对话说。
         * 用产品名 Piazza 而非底层引擎 pi，与窗口标题、侧栏保持一致。
         */
        placeholder="和 Piazza 聊点别的"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || ime.isComposing(event)) return
          event.preventDefault()
          void submit()
        }}
        {...ime.bind}
      />

      <div className={styles.composerBar}>
        {/* 占 Codex 里「+」的位置：侧边聊天不带附件，这里唯一的取材入口是引用主对话 */}
        <button
          type="button"
          className={styles.quote}
          onClick={quote}
          disabled={!hasParentMessages}
          aria-label="引用主对话"
          title="引用主对话"
        >
          <Plus size={16} />
        </button>
        <TrustPicker />

        <span className={styles.spacer} />
        <ModelPicker />

        {running ? (
          <button
            type="button"
            className={styles.send}
            aria-label="停止侧边聊天"
            onClick={() => void onStop()}
          >
            <Square size={13} />
          </button>
        ) : (
          <button
            type="submit"
            className={styles.send}
            aria-label="发送侧边聊天消息"
            disabled={blocked || sending || !draft.trim()}
          >
            <ArrowUp size={17} />
          </button>
        )}
      </div>
    </form>
  )
}
