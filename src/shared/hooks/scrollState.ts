import { EMPTY_ANCHOR, captureAnchor, type Anchor } from './scrollAnchor'

export const FOLLOW = 96
export const PINNED = 10
export const REENGAGE = 32

export type ScrollDirection = 'up' | 'down'

export interface Measurement {
  el: HTMLElement
  content: Element
}

export interface ScrollState {
  following: boolean
  smoothScrolling: boolean
  pointerDown: boolean
  userIntent: ScrollDirection | null
  away: boolean
  lastTop: number
  lastHeight: number
  anchor: Anchor
  anchorFrame: number
  smoothTimer: number
}

export function distanceOf(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight)
}

export function createScrollState(): ScrollState {
  return {
    following: true,
    smoothScrolling: false,
    pointerDown: false,
    userIntent: null,
    away: false,
    lastTop: 0,
    lastHeight: 0,
    anchor: EMPTY_ANCHOR,
    anchorFrame: 0,
    smoothTimer: 0,
  }
}

export function reportAway(s: ScrollState, away: boolean, setAway: (v: boolean) => void): void {
  if (s.away === away) return
  s.away = away
  setAway(away)
}

export function cancelScrollTimers(s: ScrollState): void {
  if (s.anchorFrame) cancelAnimationFrame(s.anchorFrame)
  if (s.smoothTimer) window.clearTimeout(s.smoothTimer)
  s.anchorFrame = 0
  s.smoothTimer = 0
}

export function syncMetrics(s: ScrollState, el: HTMLElement): void {
  s.lastTop = el.scrollTop
  s.lastHeight = el.scrollHeight
}

/** 先读后写且跳过已在底部的无效赋值，避免写后再读触发布局抖动 */
export function pinToBottom(s: ScrollState, el: HTMLElement): void {
  const height = el.scrollHeight
  const maxTop = Math.max(0, height - el.clientHeight)
  const curTop = el.scrollTop
  s.lastHeight = height
  if (curTop < maxTop - 0.5) {
    el.scrollTop = height
    s.lastTop = maxTop
  } else {
    s.lastTop = curTop
  }
}

/** 合并到每帧一次抓锚点，避免 120Hz 滚动/滚轮期间每帧同步触发多次 getBoundingClientRect */
export function scheduleAnchorCapture(s: ScrollState, m: Measurement): void {
  if (s.anchorFrame) return
  s.anchorFrame = requestAnimationFrame(() => {
    s.anchorFrame = 0
    if (!s.following) s.anchor = captureAnchor(m.el, m.content)
  })
}

export function detachFollow(
  s: ScrollState,
  el: HTMLElement,
  content: Element,
  setAway: (v: boolean) => void,
): void {
  cancelScrollTimers(s)
  Object.assign(s, { following: false, smoothScrolling: false, userIntent: 'up' })
  syncMetrics(s, el)
  reportAway(s, distanceOf(el) > FOLLOW, setAway)
  scheduleAnchorCapture(s, { el, content })
}

export function reengageFollow(
  s: ScrollState,
  el: HTMLElement,
  setAway: (v: boolean) => void,
): void {
  cancelScrollTimers(s)
  Object.assign(s, {
    following: true,
    smoothScrolling: false,
    userIntent: null,
    anchor: EMPTY_ANCHOR,
  })
  syncMetrics(s, el)
  reportAway(s, false, setAway)
}

export function restoreScrollPosition(
  s: ScrollState,
  m: Measurement,
  scrollTop: number,
  setAway: (v: boolean) => void,
): void {
  cancelScrollTimers(s)
  m.el.scrollTop = scrollTop
  Object.assign(s, {
    following: false,
    smoothScrolling: false,
    userIntent: null,
    anchor: captureAnchor(m.el, m.content),
  })
  syncMetrics(s, m.el)
  reportAway(s, distanceOf(m.el) > FOLLOW, setAway)
}

export function syncThumbDirection(
  s: ScrollState,
  m: Measurement,
  direction: ScrollDirection,
  setAway: (v: boolean) => void,
): void {
  if (direction === 'up') {
    s.userIntent = 'up'
    if (s.following || s.smoothScrolling) detachFollow(s, m.el, m.content, setAway)
    return
  }
  s.userIntent = 'down'
  if (distanceOf(m.el) <= REENGAGE) return reengageFollow(s, m.el, setAway)
  syncMetrics(s, m.el)
  reportAway(s, distanceOf(m.el) > FOLLOW, setAway)
  scheduleAnchorCapture(s, m)
}
