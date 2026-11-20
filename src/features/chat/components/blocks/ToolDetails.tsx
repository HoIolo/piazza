import { useState } from 'react'
import { Check, Copy, CircleAlert } from 'lucide-react'
import type { ToolExecution } from '@/store/chat'
import { resultToText, toolKind, toolTitle } from './toolFormat'
import styles from './ToolCallBlock.module.css'

export function ToolDetails({ execution }: { execution: ToolExecution }) {
  const [copied, setCopied] = useState(false)
  const output = resultToText(execution)
  const isCommand = toolKind(execution.toolName) === 'command' && typeof execution.args.command === 'string'
  const commandText = isCommand
    ? String(execution.args.command)
    : JSON.stringify(execution.args, null, 2)

  return (
    <div className={styles.detail}>
      <div className={styles.commandRow}>
        <div className={styles.command}>
          {isCommand && <span className={styles.prompt}>$</span>}
          {commandText}
        </div>
        <button
          type="button"
          className={styles.copyBtn}
          aria-label={copied ? '已复制工具输出' : '复制工具输出'}
          onClick={() => {
            void navigator.clipboard.writeText(output || commandText).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            })
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      {output && <pre className={`${styles.output} selectable`}>{output}</pre>}
      <ToolStatus title={toolTitle(execution.toolName)} execution={execution} />
    </div>
  )
}

function ToolStatus({ title, execution }: { title: string; execution: ToolExecution }) {
  if (execution.status === 'running')
    return (
      <div className={styles.status} role="status">
        <span>{title}</span>
        <span>执行中</span>
      </div>
    )
  return (
    <div className={styles.status} data-error={execution.isError}>
      <span>{title}</span>
      <span className={styles.statusMeta}>
        {execution.isError ? <CircleAlert size={12} /> : <Check size={12} />}
        {execution.isError ? '执行失败' : '执行完成'}
      </span>
    </div>
  )
}
