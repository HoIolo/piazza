import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

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
export function useStickToBottom(ref: RefObject<HTMLElement | null>) {
  const stuck = useRef(true)
  const [awayFromBottom, setAwayFromBottom] = useState(false)
  const jumpToBottom = useCallback(() => {
    const el = ref.current
    if (!el) return
    stuck.current = true
    el.scrollTop = el.scrollHeight
    setAwayFromBottom(false)
  }, [ref])

  useEffect(() => {
    const el = ref.current
    const content = el?.firstElementChild
    if (!el || !content) return
    let lastScrollTop = el.scrollTop

    const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight <= THRESHOLD
    const onScroll = () => {
      const top = el.scrollTop
      const bottom = atBottom()
      if (bottom || top < lastScrollTop - 2) stuck.current = bottom
      lastScrollTop = top
      setAwayFromBottom(!atBottom())
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    // 观察里面那一坨内容：滚动容器自己的高度是固定的，长高的是它的孩子
    const observer = new ResizeObserver(() => {
      if (el.dataset.restoringScroll === 'true') {
        delete el.dataset.restoringScroll
        lastScrollTop = el.scrollTop
        stuck.current = atBottom()
        setAwayFromBottom(!atBottom())
        return
      }
      if (stuck.current) {
        el.scrollTop = el.scrollHeight
        lastScrollTop = el.scrollTop
      }
      setAwayFromBottom(!atBottom())
    })
    observer.observe(content)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [ref])

  return { awayFromBottom, jumpToBottom }
}
