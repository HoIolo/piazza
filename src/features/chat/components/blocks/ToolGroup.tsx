import { useRef, useState } from 'react'
import { CodexIcon } from '@/design/icons/CodexIcon'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import { useScrollEdges } from '@/shared/hooks/useScrollEdges'
import type { ToolExecution } from '@/store/chat'
import { isImageView, toolImages, toolRuns } from './toolImages'
import { integrationSummary } from './toolIntegration'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolImageResult } from './ToolImageResult'
import { summarizeArgs, summarizeGroup, toolIcon, toolVerb } from './toolFormat'
import styles from './ToolGroup.module.css'

export interface ToolGroupProps {
  executions: ToolExecution[]
}

/**
 * 连续的一串工具调用，收成一行汇总，对应 Codex 的活动分组。
 *
 * 模型一口气读七八个文件是常态，逐行铺开会把正文挤到屏幕外。
 * 进行中这一行显示「当前正在做的那一步」，做完后换成整组的汇总
 * （已读取 3 个文件，运行 2 条命令），想看明细再点开。
 * 只有一条时不套这层壳，直接就是那一行。
 */
export function ToolGroup({ executions }: ToolGroupProps) {
  if (executions.length === 0) return null

  return (
    <div className={styles.runs}>
      {toolRuns(executions).map((run) => (
        <ToolActivityGroup key={run[0].toolCallId} executions={run} />
      ))}
    </div>
  )
}

function ToolActivityGroup({ executions }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(listRef, expanded)

  if (executions.length === 0) return null
  if (executions.length === 1) return <ToolCallBlock execution={executions[0]} />

  /*
   * 连续看了好几张图：合并成一行「已查看 N 张图像」，点开是一个相册。
   * 一张图占一行时读者得连续点开四五次，才看得出模型到底看了些什么。
   */
  if (executions.every(isImageView))
    return (
      <div data-tool-call={executions[0].toolCallId}>
        <ToolImageResult
          images={executions.flatMap(toolImages)}
          running={executions.some((execution) => execution.status === 'running')}
        />
      </div>
    )

  const active = executions.find((e) => e.status === 'running')
  const integration = integrationSummary(executions.map((execution) => execution.toolName))
  const failed = executions.filter((e) => e.isError).length

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.head}
        onClick={() => {
          setOpened(true)
          setExpanded((v) => !v)
        }}
        aria-expanded={expanded}
      >
        <CodexIcon
          name={toolIcon(executions[executions.length - 1].toolName)}
          size={16}
          className={styles.icon}
        />
        <span className={styles.label}>
          {active ? (
            <ShimmerText>
              {toolVerb(active.toolName, true)}{' '}
              <span className={styles.arg}>{summarizeArgs(active.toolName, active.args)}</span>
            </ShimmerText>
          ) : (
            (integration ?? summarizeGroup(executions.map((e) => e.toolName)))
          )}
        </span>
        {failed > 0 && <span className={styles.failed}>{failed} 项失败</span>}
        <CodexIcon name="chevron" size={12} className={styles.chevron} />
      </button>

      <div className={styles.listWrap} data-expanded={expanded} inert={!expanded}>
        <div className={styles.listClip}>
          {(expanded || opened) && (
            <div
              className={styles.list}
              ref={listRef}
              data-edge-top={edges.top}
              data-edge-bottom={edges.bottom}
            >
              {executions.map((execution) => (
                <ToolCallBlock key={execution.toolCallId} execution={execution} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
