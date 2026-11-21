import { useEffect, useState, type RefObject } from 'react'

export interface ScrollEdges {
  /** 上方还有内容被滚出去了 */
  top: boolean
  /** 下方还有内容没露出来 */
  bottom: boolean
}

/**
 * 滚动容器的上下边界状态。
 *
 * 限高之后的问题是「看着像被截断了」：macOS 的浮层滚动条不动就不出现，
 * 用户无从判断是一屏到底还是能继续滚。这里量出两个边界，交给 CSS 在对应
 * 一侧加渐隐——只有真被遮住的那一侧才隐，最后一行才不至于永远发虚。
 *
 * 容器本身尺寸变化由 ResizeObserver 覆盖；内容高度变化由 active 触发重新测量
 * （内容只在展开/切换时出现，不必为此常驻一个 MutationObserver）。
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>, active = true): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ top: false, bottom: false })

  useEffect(() => {
    const el = ref.current
    if (!el || !active) return

    const measure = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      setEdges({
        top: scrollTop > 1,
        bottom: scrollHeight - scrollTop - clientHeight > 1,
      })
    }

    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [ref, active])

  return edges
}
