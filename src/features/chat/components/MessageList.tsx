import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowDown } from 'lucide-react'
import { useElapsed } from '@/shared/hooks/useElapsed'
import { useStickToBottom } from '@/shared/hooks/useStickToBottom'
import { useAppStore } from '@/store/app.store'
import { useChatStore } from '@/store/chat'
import { useActiveExchange } from '../hooks/useActiveExchange'
import { useExchangeWindow } from '../hooks/useExchangeWindow'
import { ExchangeGroup } from './ExchangeGroup'
import { ExchangeRail } from './ExchangeRail'
import { ScrollThumb } from './ScrollThumb'
import { groupIntoExchanges, type Exchange } from './exchange'
import styles from './MessageList.module.css'

/** 预先计算每轮对应的用户消息序号，分页截断前半段后序号仍保持准确 */
function computeUserOrdinals(exchanges: Exchange[]): Array<number | undefined> {
  let ordinal = 0
  return exchanges.map((exchange) => (exchange.user ? ordinal++ : undefined))
}

/** 「回到底部」浮钮，和 Codex 一样只在离开底部超过 96px 时出现 */
function JumpToBottom({ show, onClick }: { show: boolean; onClick: () => void }) {
  if (!show) return null
  return (
    <button
      type="button"
      className={styles.jumpToBottom}
      onClick={onClick}
      aria-label="回到底部"
      title="回到底部"
    >
      <ArrowDown size={18} />
    </button>
  )
}

/** 消息流滚动容器 */
export function MessageList() {
  const containerRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Array<HTMLElement | null>>([])
  const pendingJumpRef = useRef<number | null>(null)

  const messages = useChatStore((s) => s.messages)
  const viewKey = useChatStore((s) => s.viewKey)
  const streaming = useChatStore((s) => s.streaming)
  const tools = useChatStore((s) => s.tools)
  const paused = useChatStore((s) => s.paused)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const isCompacting = useChatStore((s) => s.isCompacting)
  const turnStartedAt = useChatStore((s) => s.turnStartedAt)
  const lastTurnDurationMs = useChatStore((s) => s.lastTurnDurationMs)
  const cwd = useAppStore((s) => s.currentCwd)
  const sessionKey = viewKey
  const sessionPath = viewKey.startsWith('new:') || viewKey === 'init' ? null : viewKey

  const elapsedMs = useElapsed(isStreaming || isCompacting ? turnStartedAt : null)

  // 流式中的消息尚未进入 messages，先并进去再分组，
  // 这样进行中的这次交互与历史走同一套渲染，不必写两份
  const exchanges = useMemo(
    () => groupIntoExchanges(streaming ? [...messages, streaming] : messages),
    [messages, streaming],
  )
  const userOrdinals = useMemo(() => computeUserOrdinals(exchanges), [exchanges])

  const busy = isStreaming || isCompacting
  const stick = useStickToBottom(containerRef, busy)

  const { start, loadOlder, ensureVisible } = useExchangeWindow(
    containerRef,
    sessionKey,
    sessionPath,
    exchanges.length,
    stick,
  )

  const activeIndex = useActiveExchange(containerRef, groupRefs, exchanges.length - start)

  const jumpTo = useCallback(
    (index: number) => {
      if (index < exchanges.length - 1) stick.detach()
      if (index < start) {
        pendingJumpRef.current = index
        ensureVisible(index)
        return
      }
      groupRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [ensureVisible, exchanges.length, start, stick],
  )

  useEffect(() => {
    const target = pendingJumpRef.current
    if (target === null || target < start) return
    pendingJumpRef.current = null
    groupRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [start])

  const visibleExchanges = start > 0 ? exchanges.slice(start) : exchanges

  return (
    <div className={styles.wrap}>
      {/* 刻度条放在滚动容器之外：它要贴聊天区左缘，不能跟着正文列走 */}
      <ExchangeRail exchanges={exchanges} activeIndex={activeIndex} onJump={jumpTo} />

      <div className={styles.scroller} ref={containerRef}>
        <div className={styles.inner}>
          {start > 0 && (
            <div className={styles.olderBar}>
              <button type="button" className={styles.olderBtn} onClick={loadOlder}>
                显示更早的 {start} 轮对话
              </button>
            </div>
          )}
          {visibleExchanges.map((exchange, offset) => {
            const index = start + offset
            const isLast = index === exchanges.length - 1
            return (
              <ExchangeGroup
                key={`${sessionKey}:${index}`}
                ref={(el) => {
                  groupRefs.current[index] = el
                }}
                exchange={exchange}
                userIndex={userOrdinals[index]}
                tools={tools}
                cwd={cwd}
                active={isStreaming && isLast}
                compacting={isCompacting && isLast}
                paused={paused && isLast}
                disabled={isStreaming || isCompacting}
                scrollKey={`${sessionKey}:${index}`}
                elapsedMs={isLast ? elapsedMs : null}
                /* 本地量的耗时只属于刚跑完的那一轮，更早的没有 */
                finishedMs={!isStreaming && !isCompacting && isLast ? lastTurnDurationMs : null}
              />
            )
          })}
        </div>
      </div>
      <ScrollThumb containerRef={containerRef} onDragScroll={stick.syncThumbScroll} />
      <JumpToBottom show={stick.awayFromBottom} onClick={stick.jumpToBottom} />
    </div>
  )
}
