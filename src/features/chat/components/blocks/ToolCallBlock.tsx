import { useState } from 'react'
import { Check, ChevronRight, CircleAlert, Square } from 'lucide-react'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import type { ToolExecution } from '@/store/chat'
import { resultToText, summarizeArgs, toolTitle, toolVerb } from './toolFormat'
import styles from './ToolCallBlock.module.css'

export interface ToolCallBlockProps {
  execution: ToolExecution
}

/**
 * 工具调用。折叠态是一行文字（「正在运行 pwd」/「已运行 pwd」），
 * 与 Codex 一致——工具调用是过程信息，不该用卡片抢正文的视觉权重。
 * 展开后才显示带结果的卡片。
 */
export function ToolCallBlock({ execution }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)

  const running = !execution.result && !execution.isError
  const summary = summarizeArgs(execution.toolName, execution.args)
  const output = resultToText(execution)
  const canExpand = !running && Boolean(output)

  return (
    <div className={styles.block}>
      <button
        type="button"
        className={styles.line}
        data-running={running}
        onClick={() => canExpand && setExpanded((v) => !v)}
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
      >
        <Square size={13} className={styles.icon} />
        <span className={styles.text}>
          <ShimmerText active={running}>
            {toolVerb(execution.toolName, running)}
            {summary && <span className={styles.arg}> {summary}</span>}
          </ShimmerText>
        </span>
        {canExpand && (
          <ChevronRight size={13} className={styles.chevron} data-expanded={expanded} />
        )}
        {execution.isError && <CircleAlert size={13} className={styles.errorIcon} />}
      </button>

      <div className={styles.detailWrap} data-expanded={expanded && canExpand}>
        <div className={styles.detailClip}>
          <div className={styles.detail}>
            <div className={styles.detailHead}>{toolTitle(execution.toolName)}</div>
            {summary && <div className={styles.command}>$ {summary}</div>}
            <pre className={`${styles.output} selectable`}>{output}</pre>
            <div className={styles.status} data-error={execution.isError}>
              {execution.isError ? (
                <>
                  <CircleAlert size={13} />
                  失败
                </>
              ) : (
                <>
                  <Check size={13} />
                  成功
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
