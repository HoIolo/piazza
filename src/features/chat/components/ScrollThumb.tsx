import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import styles from './ScrollThumb.module.css'

const HIDE_DELAY_MS = 800
const TRACK_INSET = 6
const MIN_THUMB_H = 28

interface Metrics {
  visible: boolean
  top: number
  height: number
  maxScroll: number
  maxTravel: number
}

function measure(el: HTMLElement): Metrics {
  const { scrollTop, scrollHeight, clientHeight } = el
  const maxScroll = scrollHeight - clientHeight
  if (maxScroll <= 2 || clientHeight <= TRACK_INSET * 2) {
    return { visible: false, top: TRACK_INSET, height: 0, maxScroll: 0, maxTravel: 0 }
  }
  const track = clientHeight - TRACK_INSET * 2
  const height = Math.max(MIN_THUMB_H, Math.min(track, (clientHeight / scrollHeight) * track))
  const maxTravel = Math.max(1, track - height)
  const top = TRACK_INSET + (scrollTop / maxScroll) * maxTravel
  return { visible: true, top, height, maxScroll, maxTravel }
}

/**
 * 覆盖式滚动条滑块：仅在滚动或拖拽时显现，停止后平滑淡出。
 * 使用真实 DOM 节点而非 ::-webkit-scrollbar-thumb，规避 macOS WKWebView
 * 动态切换伪元素样式不重绘的问题。
 */
export function ScrollThumb({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const thumbRef = useRef<HTMLDivElement>(null)
  const metricsRef = useRef<Metrics>({
    visible: false,
    top: TRACK_INSET,
    height: 0,
    maxScroll: 0,
    maxTravel: 0,
  })
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null)
  const [shown, setShown] = useState(false)
  const [dragging, setDragging] = useState(false)
  const hoveringRef = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let hideTimer: number | undefined

    const paint = () => {
      const m = measure(el)
      metricsRef.current = m
      const node = thumbRef.current
      if (!node) return
      node.style.height = `${m.height}px`
      node.style.transform = `translateY(${m.top}px)`
      if (!m.visible) setShown(false)
    }

    const scheduleHide = () => {
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => {
        if (!dragRef.current && !hoveringRef.current) setShown(false)
      }, HIDE_DELAY_MS)
    }

    const onScroll = () => {
      paint()
      if (metricsRef.current.visible) {
        setShown(true)
        scheduleHide()
      }
    }

    paint()
    const ro = new ResizeObserver(paint)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.clearTimeout(hideTimer)
      ro.disconnect()
      el.removeEventListener('scroll', onScroll)
    }
  }, [containerRef])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current
    if (!el) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startTop: el.scrollTop }
    setDragging(true)
    setShown(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current
    const drag = dragRef.current
    const m = metricsRef.current
    if (!el || !drag || m.maxTravel <= 0) return
    const delta = e.clientY - drag.startY
    el.scrollTop = drag.startTop + (delta / m.maxTravel) * m.maxScroll
  }

  const onPointerUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    if (!hoveringRef.current) setShown(false)
  }

  return (
    <div
      ref={thumbRef}
      className={styles.thumb}
      data-visible={shown || dragging}
      data-dragging={dragging}
      onPointerEnter={() => {
        hoveringRef.current = true
      }}
      onPointerLeave={() => {
        hoveringRef.current = false
        if (!dragRef.current) setShown(false)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-hidden="true"
    />
  )
}
