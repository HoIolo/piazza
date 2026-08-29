import { useCallback, useRef } from 'react'
import { useElapsed } from '@/shared/hooks/useElapsed'
import { useStickToBottom } from '@/shared/hooks/useStickToBottom'
import { useChatStore } from '@/store/chat'
import { useAppStore } from '@/store/app.store'
import { useActiveExchange } from '../hooks/useActiveExchange'
import { ExchangeGroup } from './ExchangeGroup'
import { ExchangeRail } from './ExchangeRail'
import { groupIntoExchanges } from './exchange'
import styles from './MessageList.module.css'

/** 消息流滚动容器 */
export function MessageList() {
  const containerRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Array<HTMLElement | null>>([])

  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const tools = useChatStore((s) => s.tools)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const turnStartedAt = useChatStore((s) => s.turnStartedAt)
  const lastTurnDurationMs = useChatStore((s) => s.lastTurnDurationMs)
  const cwd = useAppStore((s) => s.currentCwd)

  const elapsedMs = useElapsed(isStreaming ? turnStartedAt : null)

  // 流式中的消息尚未进入 messages，先并进去再分组，
  // 这样进行中的这次交互与历史走同一套渲染，不必写两份
  const exchanges = groupIntoExchanges(streaming ? [...messages, streaming] : messages)

  // 内容长高就贴底，由 ResizeObserver 直接盯高度
  useStickToBottom(containerRef)

  const activeIndex = useActiveExchange(containerRef, groupRefs, exchanges.length)

  const jumpTo = useCallback((index: number) => {
    groupRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className={styles.wrap}>
      {/* 刻度条放在滚动容器之外：它要贴聊天区左缘，不能跟着正文列走 */}
      <ExchangeRail exchanges={exchanges} activeIndex={activeIndex} onJump={jumpTo} />

      <div className={styles.scroller} ref={containerRef}>
        <div className={styles.inner}>
          {exchanges.map((exchange, index) => (
            <ExchangeGroup
              key={index}
              ref={(el) => {
                groupRefs.current[index] = el
              }}
              exchange={exchange}
              tools={tools}
              cwd={cwd}
              active={isStreaming && index === exchanges.length - 1}
              elapsedMs={elapsedMs}
              /* 本地量的耗时只属于刚跑完的那一轮，更早的没有 */
              finishedMs={
                !isStreaming && index === exchanges.length - 1 ? lastTurnDurationMs : null
              }
            />
          ))}

          {/*
            发送后留出约 40vh 空白，让新消息从视口上方开始，
            而不是紧贴输入框往上挤。回答变长时这块空白被自然吃掉。
          */}
          {isStreaming && <div className={styles.tailSpace} />}
        </div>
      </div>
    </div>
  )
}
