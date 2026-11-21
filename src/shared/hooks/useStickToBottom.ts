import { useCallback, useRef, useState, type RefObject } from 'react'
import { FOLLOW, PINNED, initialState, useFollowOnMessages, useScrollWatch } from './scrollWatch'
import { EMPTY_ANCHOR } from './scrollAnchor'

/**
 * 内容增长时自动滚到底，但仅在用户本来就停在底部时才滚。
 * 用户向上翻阅历史时不应被新内容强行拽回去。
 *
 * 对齐 Codex 的 conversation viewport，补齐三点：
 * 1. 双阈值（96 / 10）。原先进出共用一个 80px，轻微上滚后仍会被拽回底部。
 * 2. 按「最后一条是否新增」分档，见 scrollWatch.ts。
 * 3. 锚点回补，见 scrollAnchor.ts。
 *
 * 细节实现拆在 scrollWatch.ts / scrollAnchor.ts，这里只做编排。
 */
export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  sessionKey: string,
  lastKey: string | null,
) {
  const state = useRef(initialState(sessionKey))
  const [awayFromBottom, setAwayFromBottom] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    const content = el?.firstElementChild
    if (!el || !content) return null
    return { el, content, distance: el.scrollHeight - el.scrollTop - el.clientHeight }
  }, [ref])

  const sync = useCallback(() => {
    const m = measure()
    if (!m) return
    state.current.following = m.distance <= FOLLOW
    state.current.pinnedToBottom = m.distance <= PINNED
    // 按钮显隐跟 following 走：Codex 是 isScrolledFromBottom = !nearBottom(96)
    setAwayFromBottom(m.distance > FOLLOW)
  }, [measure])

  const jumpToBottom = useCallback(() => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'instant' : 'smooth' })
    state.current.following = true
    state.current.pinnedToBottom = true
    state.current.anchor = EMPTY_ANCHOR
    setAwayFromBottom(false)
  }, [ref])

  useScrollWatch({ stateRef: state, measure, sync })
  useFollowOnMessages({ stateRef: state, measure, sync }, sessionKey, lastKey)

  return { awayFromBottom, jumpToBottom }
}
