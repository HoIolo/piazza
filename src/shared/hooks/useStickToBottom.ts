import { useEffect, useRef, type RefObject } from 'react'

/** 判定「已在底部」的容差，避免像素级抖动导致误判 */
const THRESHOLD = 80

/**
 * 内容增长时自动滚到底，但仅在用户本来就停在底部时才滚。
 * 用户向上翻阅历史时不应被新内容强行拽回去。
 *
 * 盯的是内容的实际高度，而不是「消息条数变了没有」。
 * 后者看着够用，实际漏掉了最主要的场景：流式输出是往同一个文本块里
 * 一个字一个字追加的，条数和块数自始至终不变，于是整段回答刷完，
 * 滚动条一次都不会动——回答越长，离底越远。
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>): void {
  const stuck = useRef(true)

  useEffect(() => {
    const el = ref.current
    const content = el?.firstElementChild
    if (!el || !content) return

    const onScroll = () => {
      stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight <= THRESHOLD
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    // 观察里面那一坨内容：滚动容器自己的高度是固定的，长高的是它的孩子
    const observer = new ResizeObserver(() => {
      if (el.dataset.restoringScroll === 'true') {
        delete el.dataset.restoringScroll
        onScroll()
        return
      }
      if (stuck.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(content)

    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [ref])
}
