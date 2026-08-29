import { useEffect, useState, type RefObject } from 'react'

/** 判定「已经在看这一轮」的容忍量：顶边越过容器上沿这么多像素才算 */
const ENTER_OFFSET = 80

/**
 * 当前正在阅读的那次交互，用于让会话刻度跟着滚动走。
 *
 * 取「顶边已越过容器上沿」的最后一个，而不是 IntersectionObserver 的
 * 「可见面积最大」——后者遇到超长回答会一直卡在同一条上，滚了半天刻度不动。
 */
export function useActiveExchange(
  containerRef: RefObject<HTMLElement | null>,
  groupRefs: RefObject<Array<HTMLElement | null>>,
  count: number,
): number {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let frame = 0
    const update = () => {
      frame = 0
      const line = el.getBoundingClientRect().top + ENTER_OFFSET
      let next = 0
      groupRefs.current.forEach((group, index) => {
        if (group && group.getBoundingClientRect().top <= line) next = index
      })
      setActive(next)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    el.addEventListener('scroll', schedule, { passive: true })
    // 首次也走 rAF：在 effect 里同步 setState 会多触发一轮渲染
    schedule()

    return () => {
      el.removeEventListener('scroll', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [containerRef, groupRefs, count])

  return active
}
