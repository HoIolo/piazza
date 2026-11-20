import { useEffect, useState, type RefObject } from 'react'

/**
 * 元素宽度是否达到 min。
 *
 * 盯的是元素本身而不是窗口：侧栏、右侧面板的开合都会改变主区宽度，
 * 按窗口宽度算会在面板展开时把内容挤成一条。
 * 首次测量由 ResizeObserver 的初始回调完成，effect 里不做同步 setState。
 */
export function useMinWidth(ref: RefObject<HTMLElement | null>, min: number): boolean {
  const [reached, setReached] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      setReached(entry.contentRect.width >= min)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, min])

  return reached
}
