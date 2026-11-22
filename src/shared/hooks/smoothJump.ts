import { EMPTY_ANCHOR } from './scrollAnchor'
import {
  cancelScrollTimers,
  pinToBottom,
  reengageFollow,
  reportAway,
  type ScrollState,
} from './scrollState'

/** 平滑滚动兜底：scrollTo({behavior:'smooth'}) 不派发完成事件，超时后强制归位 */
const SMOOTH_FALLBACK_MS = 520

/**
 * 「回到底部」按钮的平滑跳转。
 *
 * 平滑滚动期间 scrollTop 每帧都在变，必须让 state 知道这是程序化动作
 * （smoothScrolling），否则会被当成用户滚动而反复 detach。
 */
export function startSmoothJump(
  s: ScrollState,
  el: HTMLElement,
  setAway: (v: boolean) => void,
): void {
  cancelScrollTimers(s)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reengageFollow(s, el, setAway)
    return pinToBottom(s, el)
  }
  s.following = true
  s.smoothScrolling = true
  s.userIntent = 'down'
  s.anchor = EMPTY_ANCHOR
  reportAway(s, false, setAway)
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  s.smoothTimer = window.setTimeout(() => {
    s.smoothTimer = 0
    if (!s.smoothScrolling) return
    reengageFollow(s, el, setAway)
    pinToBottom(s, el)
  }, SMOOTH_FALLBACK_MS)
}
