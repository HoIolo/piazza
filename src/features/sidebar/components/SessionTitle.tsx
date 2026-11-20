import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import styles from './SessionRow.module.css'

/** 悬停时右侧置顶与更多菜单两个按钮占用的宽度（2 * 24px + 间距） */
const HOVER_ACTIONS_W = 56
/** 滚动速度（px/s），对齐 Codex 侧栏标题平滑匀速横移 */
const SCROLL_SPEED_PX = 42

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
          '--title-dur': `${Math.max(1.1, state.hoverShift / SCROLL_SPEED_PX).toFixed(2)}s`,
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
