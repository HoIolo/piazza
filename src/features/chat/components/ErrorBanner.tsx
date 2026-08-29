import { useState } from 'react'
import { AlertCircle, ChevronRight, RotateCw, X } from 'lucide-react'
import type { ChatError } from '@/store/chat'
import styles from './ErrorBanner.module.css'

export interface ErrorBannerProps {
  error: ChatError
  /** 会话断了才用得上——普通报错关掉即可，多一个按钮只会让人犹豫 */
  onReconnect: () => void
  onDismiss: () => void
}

/**
 * 错误横幅。挂在主区顶部而不是消息流内部——
 * 空状态下消息流并不挂载，放在那里会让「连不上 pi」这类错误彻底不可见。
 */
export function ErrorBanner({ error, onReconnect, onDismiss }: ErrorBannerProps) {
  const [expanded, setExpanded] = useState(false)
  const { message, detail, fatal } = error

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.row}>
        <AlertCircle size={15} className={styles.icon} />

        {detail ? (
          <button
            type="button"
            className={styles.summary}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <span className={styles.text}>{message}</span>
            <ChevronRight size={13} className={styles.chevron} data-expanded={expanded} />
          </button>
        ) : (
          <span className={styles.text}>{message}</span>
        )}

        {fatal && (
          <button type="button" className={styles.action} onClick={onReconnect}>
            <RotateCw size={13} />
            重新连接
          </button>
        )}

        <button type="button" className={styles.close} onClick={onDismiss} aria-label="关闭提示">
          <X size={14} />
        </button>
      </div>

      {detail && expanded && <pre className={styles.detail}>{detail}</pre>}
    </div>
  )
}
