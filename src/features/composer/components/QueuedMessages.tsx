import { ListEnd } from 'lucide-react'
import { useChatStore } from '@/store/chat'
import styles from './QueuedMessages.module.css'

/**
 * 运行中通过 ⌘/Ctrl+Enter 排队的追加消息（等整轮结束后发送）。
 * 引导消息在发送后已直接落成右侧用户气泡，不再在输入框上方额外提示「等待引导」。
 */
export function QueuedMessages() {
  const followUp = useChatStore((s) => s.queue.followUp)
  if (followUp.length === 0) return null

  return (
    <ul className={styles.list} aria-label="待送达的消息">
      {followUp.map((text, index) => (
        <li key={`f${index}`} className={styles.row}>
          <ListEnd size={14} className={styles.icon} />
          <span className={styles.text}>{text}</span>
          <span className={styles.tag}>排队</span>
        </li>
      ))}
    </ul>
  )
}
