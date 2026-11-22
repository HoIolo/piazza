/** 覆盖式滚动条的几何量算：纯函数，不碰 React */

const TRACK_INSET = 6
const MIN_THUMB_H = 28

export interface DragOrigin {
  startY: number
  startTop: number
}

export interface Metrics {
  visible: boolean
  top: number
  height: number
  maxScroll: number
  maxTravel: number
}

export const EMPTY_METRICS: Metrics = {
  visible: false,
  top: TRACK_INSET,
  height: 0,
  maxScroll: 0,
  maxTravel: 0,
}

function measure(el: HTMLElement): Metrics {
  const { scrollTop, scrollHeight, clientHeight } = el
  const maxScroll = scrollHeight - clientHeight
  if (maxScroll <= 2 || clientHeight <= TRACK_INSET * 2) return EMPTY_METRICS
  const track = clientHeight - TRACK_INSET * 2
  const height = Math.max(MIN_THUMB_H, Math.min(track, (clientHeight / scrollHeight) * track))
  const maxTravel = Math.max(1, track - height)
  const top = TRACK_INSET + (scrollTop / maxScroll) * maxTravel
  return { visible: true, top, height, maxScroll, maxTravel }
}

/** 量一次并写进 DOM，返回同一份尺寸给调用方缓存 */
export function paintThumb(el: HTMLElement, node: HTMLElement | null): Metrics {
  const m = measure(el)
  if (node) {
    node.style.height = `${m.height}px`
    node.style.transform = `translateY(${m.top}px)`
  }
  return m
}

/** 把指针位移换算成 scrollTop，并把方向回报给跟随逻辑 */
export function applyThumbDrag(
  el: HTMLElement,
  drag: DragOrigin,
  m: Metrics,
  clientY: number,
  onDragScroll?: (direction: 'up' | 'down') => void,
): void {
  if (m.maxTravel <= 0) return
  const prevTop = el.scrollTop
  el.scrollTop = drag.startTop + ((clientY - drag.startY) / m.maxTravel) * m.maxScroll
  if (Math.abs(el.scrollTop - prevTop) >= 0.5)
    onDragScroll?.(el.scrollTop < prevTop ? 'up' : 'down')
}
