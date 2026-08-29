import { useLayoutEffect, type RefObject } from 'react'

/**
 * 让 textarea 随内容自动增高，超过上限后转为滚动。
 * 用 layout effect 是为了在浏览器绘制前完成高度调整，避免可见的跳动。
 */
export function useAutoResize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxHeight = 200,
): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    // 先归零再取 scrollHeight，否则内容变短时高度不会回缩
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [ref, value, maxHeight])
}
