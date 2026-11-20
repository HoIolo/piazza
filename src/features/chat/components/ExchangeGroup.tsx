import { memo, useMemo, useState } from 'react'
import { useChatActions, type ToolExecution } from '@/store/chat'
import { AssistantMessage } from './AssistantMessage'
import { BashExecutionItem } from './BashExecutionItem'
import { exchangeFileChanges } from './FileChangeCard/collect'
import { StatusLine } from './StatusLine'
import { UserMessage } from './UserMessage'
import type { Exchange } from './exchange'
import styles from './ExchangeGroup.module.css'

export interface ExchangeGroupProps {
  exchange: Exchange
  userIndex?: number
  tools: Record<string, ToolExecution>
  cwd: string | null
  /** 本次交互仍在进行中 */
  active?: boolean
  /** 任意轮次运行中，禁止对历史用户消息发起编辑分叉 */
  disabled?: boolean
  /** 进行中的实时耗时，用于「处理中 Ns」 */
  elapsedMs?: number | null
  /**
   * 本地量到的本轮总耗时，仅最后一轮有。
   *
   * 不能拿消息时间戳相减：pi 是在**创建**助手消息时打的时间戳，实测与用户
   * 消息只差几十毫秒，算出来永远是「耗时 0秒」。它不记完成时刻，所以更早的
   * 那些轮次只能退回时间戳差值，拿不到真实耗时。
   */
  finishedMs?: number | null
  /** 供刻度导航定位到这一组 */
  ref?: React.Ref<HTMLElement>
}

/** 过程区：折叠态不挂载子节点，避免数百条中间消息与工具输出拖垮会话切换 */
function ProcessArea({
  intermediate,
  others,
  tools,
  cwd,
  active,
  visible,
  mounted,
}: {
  intermediate: Exchange['intermediate']
  others: Exchange['others']
  tools: Record<string, ToolExecution>
  cwd: string | null
  active: boolean
  visible: boolean
  mounted: boolean
}) {
  return (
    <div
      className={styles.processWrap}
      data-active={active}
      data-expanded={visible}
      inert={!visible}
    >
      <div className={styles.processClip}>
        {mounted && (
          <div className={styles.process}>
            {others.map((message, index) =>
              message.role === 'bashExecution' ? (
                <BashExecutionItem key={`b${index}`} message={message} />
              ) : null,
            )}
            {intermediate.map((message, index) => (
              <AssistantMessage key={index} message={message} tools={tools} cwd={cwd} hideFooter />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** 状态行该显示的秒数：进行中用实时的，结束后优先用本地量的 */
function statusDurationOf(
  exchange: Exchange,
  active: boolean,
  elapsedMs: number | null | undefined,
  finishedMs: number | null | undefined,
): number | null {
  if (active) return elapsedMs ?? null
  return finishedMs ?? exchange.durationMs
}

/** 由交互状态推导这一组的显示方式，把条件判断从渲染里挪出来 */
function deriveView(
  exchange: Exchange,
  active: boolean,
  elapsedMs: number | null | undefined,
  finishedMs: number | null | undefined,
) {
  const hasProcess = exchange.intermediate.length > 0 || exchange.others.length > 0
  return {
    hasProcess,
    showStatus: hasProcess || active || exchange.durationMs !== null,
    statusDuration: statusDurationOf(exchange, active, elapsedMs, finishedMs),
    expandable: !active && hasProcess,
    // 模型是否已经吐出东西。有过程轮次，或本轮已有内容块，都算它开口了
    responded: hasProcess || (exchange.final?.content.length ?? 0) > 0,
  }
}

/**
 * 一次交互。进行中铺开全部轮次，结束后收起过程、只留最后一轮汇报——
 * 中间轮次多是「我要调用某工具」这类过场，读者真正要看的是结论。
 */
export const ExchangeGroup = memo(function ExchangeGroup({
  exchange,
  userIndex,
  tools,
  cwd,
  active = false,
  disabled = false,
  elapsedMs,
  finishedMs,
  ref,
}: ExchangeGroupProps) {
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(active)
  const { forkFromTurn } = useChatActions()
  const { user, intermediate, final, others } = exchange
  const view = deriveView(exchange, active, elapsedMs, finishedMs)
  const processVisible = (active || expanded) && view.hasProcess
  const changes = useMemo(
    () => (!active && final ? exchangeFileChanges([...intermediate, final], tools, cwd) : []),
    [active, intermediate, final, tools, cwd],
  )

  return (
    <section className={styles.group} ref={ref}>
      {user && <UserMessage message={user} userIndex={userIndex} editable={!disabled} />}

      {view.showStatus && (
        <StatusLine
          active={active}
          durationMs={view.statusDuration}
          responded={view.responded}
          expandable={view.expandable}
          expanded={expanded}
          onToggle={() => {
            setOpened(true)
            setExpanded((v) => !v)
          }}
        />
      )}

      {view.hasProcess && (
        <ProcessArea
          intermediate={intermediate}
          others={others}
          tools={tools}
          cwd={cwd}
          active={active}
          /* 进行中始终铺开，结束后交给用户决定 */
          visible={processVisible}
          mounted={processVisible || opened}
        />
      )}

      {final && (
        <AssistantMessage
          message={final}
          tools={tools}
          cwd={cwd}
          streaming={active}
          changes={changes}
          hideFooter={active}
          onFork={() => void forkFromTurn(userIndex)}
        />
      )}
    </section>
  )
})
