import { Skeleton } from '@/design/primitives/Skeleton'
import styles from './MessageListSkeleton.module.css'

/** 会话切换期间的消息占位：一问一答的形状，让等待有预期 */
export function MessageListSkeleton() {
  return (
    <div className={styles.scroller} aria-busy="true" aria-label="正在加载会话">
      <div className={styles.inner}>
        <div className={styles.userRow}>
          <Skeleton width="42%" height="38px" />
        </div>
        <div className={styles.assistant}>
          <Skeleton width="28%" height="13px" />
          <Skeleton width="94%" height="15px" />
          <Skeleton width="88%" height="15px" />
          <Skeleton width="62%" height="15px" />
        </div>
        <div className={styles.userRow}>
          <Skeleton width="30%" height="38px" />
        </div>
        <div className={styles.assistant}>
          <Skeleton width="90%" height="15px" />
          <Skeleton width="70%" height="15px" />
        </div>
      </div>
    </div>
  )
}
