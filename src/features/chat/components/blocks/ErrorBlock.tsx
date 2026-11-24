import { CodexIcon } from '@/design/icons/CodexIcon'
import { describeError } from './errorText'
import styles from './ErrorBlock.module.css'

export interface ErrorBlockProps {
  /** pi 给出的原始 errorMessage；null 表示这一轮没出错 */
  text: string | null
}

/**
 * 消息内的错误提示。
 *
 * 必须长在消息里而不是顶部横幅：错误属于「这一次回答」，
 * 挂到顶上就与具体是哪一问脱钩了，翻历史时也看不出当时发生过什么。
 *
 * 形态照 Codex 会话流里的 `system-error`（293398.6c14dfb2db.js 的 `function ee`）：
 * 它渲染 `callout({ layout: "verticalIcon", Icon })` 且不传 type，落到 normal 变体——
 * 20px 圆角的中性卡片、--alpha-16 描边、卡片阴影、16/20 内边距，
 * 左侧一个警示图标，右侧标题（14px/600）与正文（次级灰），`aside[role=alert]`。
 * 红色只出现在图标上：长对话里连挂几张红底红框会糊成一片。
 *
 * 用户自己按停止键不算故障，Codex 对这种「非错误」用的是无容器纯文本形态，
 * 所以 aborted 走另一条分支：只有一行中性灰字，不套框、不挂图标。
 */
export function ErrorBlock({ text }: ErrorBlockProps) {
  if (!text) return null

  const { title, detail, requestId, aborted } = describeError(text)

  if (aborted) {
    return (
      <aside className={styles.plain} role="alert">
        {title}
      </aside>
    )
  }

  return (
    <aside className={styles.block} role="alert">
      {/* 图标槽高 1lh、内部居中，因此与标题首行对齐而不是悬在块中间 */}
      <span className={styles.icon} aria-hidden>
        <CodexIcon name="alert" size={16} />
      </span>
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        {detail && <p className={styles.detail}>{detail}</p>}
        {/* 报障时要贴给对方，所以单独一行、可选中，别跟正文混在一起 */}
        {requestId && <p className={styles.requestId}>request id: {requestId}</p>}
      </div>
    </aside>
  )
}
