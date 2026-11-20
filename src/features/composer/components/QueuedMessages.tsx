import { CornerDownRight, ListEnd } from 'lucide-react'
import { useChatStore } from '@/store/chat'
import styles from './QueuedMessages.module.css'

/**
 * 运行中追加、尚未送达的消息。
 *
 * 这些话还没进消息流——引导要等当前工具调用结束才插入，排队要等整轮结束。
 * 不在这里显示的话，用户按完回车草稿清空，界面上却找不到刚发的那句。
 * pi 的 RPC 没有撤回排队消息的命令，所以只展示、不给删除。
 */
export function QueuedMessages() {
  const queue = useChatStore((s) => s.queue)
  if (queue.steering.length === 0 && queue.followUp.length === 0) return null

  return (
    <ul className={styles.list} aria-label="待送达的消息">
      {queue.steering.map((text, index) => (
        <li key={`s${index}`} className={styles.row}>
          <CornerDownRight size={14} className={styles.icon} />
          <span className={styles.text}>{text}</span>
          <span className={styles.tag}>引导</span>
        </li>
      ))}
      {queue.followUp.map((text, index) => (
        <li key={`f${index}`} className={styles.row}>
          <ListEnd size={14} className={styles.icon} />
          <span className={styles.text}>{text}</span>
          <span className={styles.tag}>排队</span>
        </li>
      ))}
    </ul>
  )
}
