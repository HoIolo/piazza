import { useEffect, useRef, useState, type RefObject } from 'react'
import { EMPTY_METRICS, paintThumb, type DragOrigin, type Metrics } from './scrollThumbGeometry'
import { useThumbDrag } from './useThumbDrag'

const HIDE_DELAY_MS = 800

/**
 * 显隐判定与延迟隐藏。抽成工厂是因为它同时持有「当前是否已显示」和
 * 定时器句柄，塞进 effect 里会让 effect 体超过单个函数的行数上限。
 */
function createHideToggle(
  setShown: (v: boolean) => void,
  dragRef: { current: DragOrigin | null },
  hoveringRef: { current: boolean },
) {
  let timer: number | undefined
  let shownNow = false
  return {
    toggle(next: boolean) {
      if (shownNow === next) return
      shownNow = next
      setShown(next)
    },
    scheduleHide() {
      window.clearTimeout(timer)
      timer = window.setTimeout(
        () => !dragRef.current && !hoveringRef.current && this.toggle(false),
        HIDE_DELAY_MS,
      )
    },
    dispose() {
      window.clearTimeout(timer)
    },
  }
}

/** 跟随内容高度变化与滚动，按需显隐滑块，并合并到每帧一次写入 */
function useThumbObserver(
  containerRef: RefObject<HTMLDivElement | null>,
  thumbRef: RefObject<HTMLDivElement | null>,
  metricsRef: { current: Metrics },
  dragRef: { current: DragOrigin | null },
  hoveringRef: { current: boolean },
  setShown: (v: boolean) => void,
) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let frame = 0
    const hide = createHideToggle(setShown, dragRef, hoveringRef)
    const runPaint = (reveal: boolean) => {
      frame = 0
      metricsRef.current = paintThumb(el, thumbRef.current)
      if (!metricsRef.current.visible) return hide.toggle(false)
      if (reveal) {
        hide.toggle(true)
        hide.scheduleHide()
      }
    }
    const schedule = (reveal: boolean) => {
      if (!frame) frame = requestAnimationFrame(() => runPaint(reveal))
      else if (reveal) hide.scheduleHide()
    }
    runPaint(false)
    const ro = new ResizeObserver(() => schedule(false))
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    const onScroll = () => schedule(true)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      hide.dispose()
      cancelAnimationFrame(frame)
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [containerRef, dragRef, hoveringRef, metricsRef, setShown, thumbRef])
}

/** 覆盖式滚动条的全部状态与交互 */
export function useScrollThumb(
  containerRef: RefObject<HTMLDivElement | null>,
  onDragScroll?: (direction: 'up' | 'down') => void,
) {
  const thumbRef = useRef<HTMLDivElement>(null)
  const metricsRef = useRef<Metrics>(EMPTY_METRICS)
  const dragRef = useRef<DragOrigin | null>(null)
  const hoveringRef = useRef(false)
  const [shown, setShown] = useState(false)
  const [dragging, setDragging] = useState(false)

  useThumbObserver(containerRef, thumbRef, metricsRef, dragRef, hoveringRef, setShown)
  const handlers = useThumbDrag(
    { containerRef, metricsRef, dragRef, hoveringRef },
    { setShown, setDragging, onDragScroll },
  )

  return { thumbRef, shown, dragging, handlers }
}
