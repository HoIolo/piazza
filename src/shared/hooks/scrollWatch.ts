import { useEffect } from 'react'
import { restoreAnchor } from './scrollAnchor'
import { bindUserInputs } from './scrollInputs'
import {
  FOLLOW,
  PINNED,
  REENGAGE,
  cancelScrollTimers,
  detachFollow,
  distanceOf,
  pinToBottom,
  reengageFollow,
  reportAway,
  scheduleAnchorCapture,
  syncMetrics,
  type Measurement,
  type ScrollState,
} from './scrollState'

function handleScroll(s: ScrollState, m: Measurement, setAway: (v: boolean) => void): void {
  const { el, content } = m
  const top = el.scrollTop
  const height = el.scrollHeight
  const distance = Math.max(0, height - top - el.clientHeight)
  const prevTop = s.lastTop
  s.lastTop = top
  s.lastHeight = height

  if (s.smoothScrolling) {
    if (distance <= PINNED) reengageFollow(s, el, setAway)
    return
  }
  if (s.following) {
    // 无用户输入时绝不从被动 scroll 事件解除跟随；仅按住指针拖选向上滚时解除
    if (s.pointerDown && top < prevTop - 2 && distance > PINNED) {
      detachFollow(s, el, content, setAway)
    }
    return
  }
  if (s.userIntent !== 'up' && distance <= REENGAGE) return reengageFollow(s, el, setAway)
  reportAway(s, distance > FOLLOW, setAway)
  scheduleAnchorCapture(s, m)
}

function handleResize(s: ScrollState, m: Measurement, setAway: (v: boolean) => void): void {
  const { el, content } = m
  if (s.following) {
    if (!s.smoothScrolling) pinToBottom(s, el)
    return
  }
  if (s.anchor.key !== null) restoreAnchor(el, content, s.anchor)
  syncMetrics(s, el)
  reportAway(s, distanceOf(el) > FOLLOW, setAway)
}

function bindScrollEvents(
  s: ScrollState,
  m: Measurement,
  setAway: (away: boolean) => void,
): () => void {
  const onScroll = () => handleScroll(s, m, setAway)
  const onScrollEnd = () => {
    if (!s.smoothScrolling) return
    reengageFollow(s, m.el, setAway)
    pinToBottom(s, m.el)
  }
  const observer = new ResizeObserver(() => handleResize(s, m, setAway))
  observer.observe(m.content)
  observer.observe(m.el)
  m.el.addEventListener('scroll', onScroll, { passive: true })
  m.el.addEventListener('scrollend', onScrollEnd)
  return () => {
    observer.disconnect()
    m.el.removeEventListener('scroll', onScroll)
    m.el.removeEventListener('scrollend', onScrollEnd)
  }
}

/** 监听滚动、尺寸变化与用户输入意图；仅由真实用户输入解除 following */
export function useScrollWatch(
  stateRef: { current: ScrollState },
  measure: () => Measurement | null,
  setAway: (away: boolean) => void,
): void {
  useEffect(() => {
    const m = measure()
    if (!m) return
    const state = stateRef.current
    syncMetrics(state, m.el)
    const unbindInputs = bindUserInputs(state, m, setAway)
    const unbindScroll = bindScrollEvents(state, m, setAway)
    return () => {
      unbindScroll()
      unbindInputs()
      cancelScrollTimers(state)
    }
  }, [measure, stateRef, setAway])
}
