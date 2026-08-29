import { useMemo, useState } from 'react'
import type { Exchange } from './exchange'
import styles from './ExchangeRail.module.css'

export interface ExchangeRailProps {
  exchanges: Exchange[]
  /** 当前正在阅读的交互序号，刻度据此跟随滚动高亮 */
  activeIndex: number
  /** 跳转到第 index 次交互 */
  onJump: (index: number) => void
}

/** 刻度基础长度与放大量（px）。active 即 BASE_W + GROW_W */
const BASE_W = 10
const GROW_W = 14
/** 放大的影响半径：离鼠标这么多格以外就回到基础长度 */
const RADIUS = 4
/**
 * 刻度条数上限。一轮一道在长会话里会顶出视口，
 * 超过就等距抽样——每道仍指向一次真实交互，点击与摘要都还是准的。
 */
const MAX_TICKS = 48

/**
 * 距离衰减，线性。
 *
 * 用过余弦，但它两端平缓，±1 处几乎和 active 一样长，档位分不出来；
 * 线性能让「最长 / 短一档 / 再短一档」逐级可辨，这正是要的效果。
 */
function falloff(distance: number): number {
  return Math.max(0, 1 - distance / RADIUS)
}

/** 取消息纯文本，用于刻度悬浮时的摘要 */
function summarize(exchange: Exchange): { question: string; answer: string } {
  const raw = exchange.user?.content
  const question = typeof raw === 'string' ? raw : (raw?.find((b) => b.type === 'text')?.text ?? '')

  const answer =
    exchange.final?.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ') ?? ''

  return { question: question.trim(), answer: answer.trim() }
}

/** 交互列表压到不超过 MAX_TICKS 条，每条记住它指向的原始序号 */
function buildTicks(exchanges: Exchange[]): Array<{ exchange: Exchange; index: number }> {
  if (exchanges.length <= MAX_TICKS) {
    return exchanges.map((exchange, index) => ({ exchange, index }))
  }
  const last = exchanges.length - 1
  return Array.from({ length: MAX_TICKS }, (_, k) => {
    const index = Math.round((k * last) / (MAX_TICKS - 1))
    return { exchange: exchanges[index], index }
  })
}

/**
 * 会话刻度。每次交互一道等长横杠，悬停出摘要、点击跳转——
 * 长会话里用它比拖滚动条找得快。
 *
 * 长度只在鼠标靠近时变化，且相邻几道会跟着一起变（类似程序坞的放大效果）：
 * 静止时长度一致才能读出「共几轮」，把长度挪作内容多寡的编码反而干扰这个判断。
 *
 * 宽度不够时由容器查询整体隐藏，不与正文抢空间。
 */
export function ExchangeRail({ exchanges, activeIndex, onJump }: ExchangeRailProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const ticks = useMemo(() => buildTicks(exchanges), [exchanges])

  if (exchanges.length < 2) return null

  // 抽样后 activeIndex 未必正好是某一条，落到最近的一条上
  let activeTick = 0
  ticks.forEach((tick, k) => {
    if (Math.abs(tick.index - activeIndex) < Math.abs(ticks[activeTick].index - activeIndex)) {
      activeTick = k
    }
  })

  return (
    <nav
      className={styles.rail}
      aria-label="会话刻度"
      /* 离开整条轨道才清空——挂在单个刻度上会导致刻度间的空隙触发抖动 */
      onMouseLeave={() => setHovered(null)}
    >
      {ticks.map((tick, k) => {
        const { question, answer } = summarize(tick.exchange)
        const scale = hovered === null ? 0 : falloff(Math.abs(k - hovered))
        // 悬停时以鼠标所指为准，松开后回到「正在阅读的那一轮」
        const lit = hovered === null ? k === activeTick : k === hovered

        return (
          <div key={tick.index} className={styles.slot} onMouseEnter={() => setHovered(k)}>
            <button
              type="button"
              className={styles.tick}
              data-active={lit}
              /* 按钮本身是命中区、宽度固定，线长通过变量传给 ::before */
              style={{ '--tick-w': `${BASE_W + scale * GROW_W}px` } as React.CSSProperties}
              onClick={() => onJump(tick.index)}
              aria-label={question || `第 ${tick.index + 1} 轮`}
              aria-current={lit || undefined}
            />
            {hovered === k && (
              <div className={styles.preview}>
                <p className={styles.question}>{question || '（无提问）'}</p>
                {answer && <p className={styles.answer}>{answer}</p>}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
