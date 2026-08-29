import type { BashExecutionMessage } from '@/rpc/types'
import styles from './BashExecutionItem.module.css'

export interface BashExecutionItemProps {
  message: BashExecutionMessage
}

/** 用户通过 RPC bash 命令直接执行的结果，独立于 LLM 的工具调用 */
export function BashExecutionItem({ message }: BashExecutionItemProps) {
  return (
    <div className={styles.block} data-failed={message.exitCode !== 0}>
      <div className={styles.command}>
        <span className={styles.prompt}>$</span>
        <span className="selectable">{message.command}</span>
      </div>
      {message.output && <pre className={`${styles.output} selectable`}>{message.output}</pre>}
      {message.truncated && <div className={styles.note}>输出过长已截断</div>}
    </div>
  )
}
