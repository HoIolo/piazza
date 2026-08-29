import { describeError } from './errorText'
import styles from './ErrorBlock.module.css'

export interface ErrorBlockProps {
  /** pi 给出的原始 errorMessage；null 表示这一轮没出错 */
  text: string | null
}

/**
 * 消息内的错误块。
 *
 * 必须长在消息里而不是顶部横幅：错误属于「这一次回答」，
 * 挂到顶上就与具体是哪一问脱钩了，翻历史时也看不出当时发生过什么。
 * Codex 与 Cline 都是这么放的。
 */
export function ErrorBlock({ text }: ErrorBlockProps) {
  if (!text) return null

  const { title, detail, requestId, aborted } = describeError(text)

  return (
    <div className={styles.block} data-aborted={aborted} role="alert">
      <span className={styles.dot} aria-hidden />
      <div className={styles.body}>
        <span className={styles.title}>{title}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
        {/* 报障时要贴给对方，所以单独一行、可选中，别跟正文混在一起 */}
        {requestId && <span className={styles.requestId}>request id: {requestId}</span>}
      </div>
    </div>
  )
}
