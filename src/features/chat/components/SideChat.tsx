import { useEffect, useRef, useState } from 'react'
import { MessagesSquare } from 'lucide-react'
import { basename } from '@/shared/utils/path'
import { useAppStore } from '@/store/app.store'
import type { ChatSnapshot } from '@/store/chat/types'
import { AssistantMessage } from './AssistantMessage'
import { DialogCard } from './DialogCard'
import { SideComposer } from './SideComposer'
import { UserMessage } from './UserMessage'
import { useSideChatSession } from './useSideChatSession'
import styles from './SideChat.module.css'

function SideTranscript({ cwd, snapshot }: { cwd: string; snapshot: ChatSnapshot }) {
  const { messages, streaming, tools } = snapshot
  const feed = useRef<HTMLDivElement>(null)
  const follow = useRef(true)

  useEffect(() => {
    const el = feed.current
    if (el && follow.current) el.scrollTop = el.scrollHeight
  }, [messages, streaming, tools])

  return (
    <div
      className={styles.feed}
      ref={feed}
      onScroll={(event) => {
        const el = event.currentTarget
        if (el.clientHeight) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32
      }}
    >
      {messages.length === 0 && !streaming && (
        <div className={styles.welcome}>
          <MessagesSquare size={24} />
          <h2>侧边聊天</h2>
          <p>可以在这里追问，消息会保留在这个标签里。</p>
        </div>
      )}
      {messages.map((message, index) => {
        if (message.role === 'user') return <UserMessage key={index} message={message} />
        if (message.role !== 'assistant') return null
        return <AssistantMessage key={index} message={message} cwd={cwd} tools={tools} hideFooter />
      })}
      {streaming && <AssistantMessage message={streaming} cwd={cwd} tools={tools} streaming />}
    </div>
  )
}

function SideSession({ cwd, retry }: { cwd: string; retry: () => void }) {
  const { snapshot, status, error, send, answer } = useSideChatSession(cwd)
  const { pendingDialog, isStreaming } = snapshot

  return (
    <div className={styles.chat}>
      <header className={styles.header}>
        <strong title={cwd}>{basename(cwd)}</strong>
        <span>临时对话</span>
      </header>
      <SideTranscript cwd={cwd} snapshot={snapshot} />
      <div className={styles.controls}>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {status === 'starting' && (
          <p className={styles.status} role="status">
            正在连接侧边聊天…
          </p>
        )}
        {status === 'disconnected' && (
          <button type="button" className={styles.retry} onClick={retry}>
            重新连接
          </button>
        )}
        {status === 'ready' && pendingDialog && (
          <DialogCard
            key={pendingDialog.id}
            dialog={pendingDialog}
            onAnswer={(payload) => void answer(pendingDialog.id, payload)}
          />
        )}
        <SideComposer
          blocked={status !== 'ready' || !!pendingDialog}
          running={status === 'ready' && isStreaming}
          onSend={(message) => send({ type: 'prompt', message })}
          onStop={() => send({ type: 'abort' })}
        />
      </div>
    </div>
  )
}

export function SideChat() {
  const cwd = useAppStore((s) => s.currentCwd)
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((n) => n + 1)

  if (!cwd) return <p className={styles.empty}>请选择项目后开始侧边聊天。</p>
  return <SideSession key={`${cwd}\0${attempt}`} cwd={cwd} retry={retry} />
}
