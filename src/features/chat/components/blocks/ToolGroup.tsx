import { useRef, useState } from 'react'
import { CodexIcon } from '@/design/icons/CodexIcon'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import { useScrollEdges } from '@/shared/hooks/useScrollEdges'
import type { ToolExecution } from '@/store/chat'
import { isImageView, toolImages, toolRuns } from './toolImages'
import { integrationSummary } from './toolIntegration'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolImageResult } from './ToolImageResult'
import { summarizeArgs, summarizeGroup, toolIcon, toolVerb } from './toolFormat'
import styles from './ToolGroup.module.css'

export interface ToolGroupProps {
  executions: ToolExecution[]
  /** 紧随当前工具组之后、仍在进行的思考文本；非 null 时折叠进该组并把组标题切换为「正在思考」 */
  thinking?: string | null
}

/**
 * 连续的一串工具调用，收成一行汇总，对应 Codex 的活动分组。
 *
 * 模型一口气读七八个文件是常态，逐行铺开会把正文挤到屏幕外。
 * 进行中这一行显示「当前正在做的那一步」或「正在思考」，做完后换成整组的汇总
 * （已读取 3 个文件，运行 2 条命令），想看明细再点开。
 * 只有一条且无思考时才不套这层壳，直接就是那一行。
 */
export function ToolGroup({ executions, thinking = null }: ToolGroupProps) {
  if (executions.length === 0) return null
  const runs = toolRuns(executions)
  const lastIndex = runs.length - 1
  const foldIntoLast = thinking !== null && !runs[lastIndex].every(isImageView)

  return (
    <div className={styles.runs}>
      {runs.map((run, index) => (
        <ToolActivityGroup
          key={run[0].toolCallId}
          executions={run}
          thinking={foldIntoLast && index === lastIndex ? thinking : null}
        />
      ))}
      {thinking !== null && !foldIntoLast && thinking.length > 0 && (
        <ThinkingBlock content={thinking} active />
      )}
    </div>
  )
}

function ToolGroupSummary({
  executions,
  thinking,
}: {
  executions: ToolExecution[]
  thinking: string | null
}) {
  const active = executions.find((e) => e.status === 'running')
  if (active) {
    return (
      <span className={styles.label}>
        <ShimmerText>
          {toolVerb(active.toolName, true)}{' '}
          <span className={styles.arg}>{summarizeArgs(active.toolName, active.args)}</span>
        </ShimmerText>
      </span>
    )
  }
  if (thinking !== null) {
    return (
      <span className={styles.label}>
        <ShimmerText>正在思考</ShimmerText>
      </span>
    )
  }
  const names = executions.map((e) => e.toolName)
  const failed = executions.filter((e) => e.isError).length
  return (
    <>
      <span className={styles.label}>{integrationSummary(names) ?? summarizeGroup(names)}</span>
      {failed > 0 && <span className={styles.failed}>{failed} 项失败</span>}
    </>
  )
}

function ToolActivityGroup({ executions, thinking = null }: ToolGroupProps) {
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(listRef, expanded)

  if (executions.length === 0) return null

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

  if (executions.length === 1 && thinking === null)
    return <ToolCallBlock execution={executions[0]} />

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
        <ToolGroupSummary executions={executions} thinking={thinking} />
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
              {thinking !== null && <ThinkingBlock content={thinking} active />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
