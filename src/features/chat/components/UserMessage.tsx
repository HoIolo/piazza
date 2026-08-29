import type { UserMessage as UserMessageType } from '@/rpc/types'
import { userText } from '@/shared/utils/message'
import styles from './UserMessage.module.css'

export interface UserMessageProps {
  message: UserMessageType
}

/** 用户消息：右对齐的浅灰圆角气泡 */
export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className={styles.row}>
      <div className={`${styles.bubble} selectable`}>{userText(message)}</div>
    </div>
  )
}
