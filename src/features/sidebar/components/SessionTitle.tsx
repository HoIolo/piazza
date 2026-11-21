import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import styles from './SessionRow.module.css'

/** 悬停时右侧置顶与更多菜单两个按钮占用的宽度（2 * 24px + 间距） */
const HOVER_ACTIONS_W = 56
/** Codex `--marquee-speed-em-per-second: 2`，换算成像素要乘字号 */
const SPEED_EM_PER_SECOND = 2
/** 会话行字号，与 --fs-session 一致（Codex ThreadRow text-base = 14px） */
const FONT_SIZE_PX = 14
/** Codex 的时长公式：0.35s 起速缓冲 + 行程 + 1.85s 停在末尾，方便读完 */
const LEAD_IN_S = 0.35
const TAIL_HOLD_S = 1.85

/**
 * 会话标题。溢出时悬停横向滚动，与 Codex 的 marquee 组件同参数。
 *
 * 时长不是「距离 / 速度」那么简单——Codex 在两端各留了缓冲：0.35s 让眼睛
 * 反应过来，1.85s 停在末尾把话读完。少了尾巴，标题刚滚到底就开始回弹，
 * 长标题永远读不完整。
 */
export function SessionTitle({ title }: { title: string }) {
  const viewport = useRef<HTMLSpanElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const [state, setState] = useState({ restOverflow: false, hoverShift: 0 })

  useLayoutEffect(() => {
    const clip = viewport.current
    const label = text.current
    if (!clip || !label) return
    const measure = () => {
      const textW = label.scrollWidth
      const clipW = clip.clientWidth
      const restOverflow = textW > clipW
      const hoverShift = Math.max(0, textW - Math.max(0, clipW - HOVER_ACTIONS_W))
      setState((prev) =>
        prev.restOverflow === restOverflow && prev.hoverShift === hoverShift
          ? prev
          : { restOverflow, hoverShift },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(clip)
    observer.observe(label)
    return () => observer.disconnect()
  }, [title])

  const style =
    state.hoverShift > 0
      ? ({
          '--title-scroll': `-${state.hoverShift}px`,
          '--title-dur': `${durationOf(state.hoverShift).toFixed(2)}s`,
        } as CSSProperties)
      : undefined

  return (
    <span
      className={styles.title}
      ref={viewport}
      data-overflow={state.restOverflow}
      data-hover-overflow={state.hoverShift > 0}
      style={style}
    >
      <span className={styles.titleText} ref={text}>
        {title}
      </span>
    </span>
  )
}

/** 行程决定时长，两端各留缓冲（对齐 Codex 的 marquee 时长公式） */
function durationOf(distance: number): number {
  return LEAD_IN_S + distance / (SPEED_EM_PER_SECOND * FONT_SIZE_PX) + TAIL_HOLD_S
}
