import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useAppStore } from '@/store/app.store'

const PREF_KEY = 'piazza.sidebar-width'
const DEFAULT_WIDTH = 275
const MIN_WIDTH = 210
const MAX_WIDTH = 440
const CENTER_MIN_WIDTH = 360

function readSavedWidth(): number | undefined {
  try {
    const value = Number(window.localStorage.getItem(PREF_KEY))
    return Number.isFinite(value) && value > 0 ? value : undefined
  } catch {
    return undefined
  }
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

function useWidthDrag(onResize: (width: number) => void, fallback: number) {
  const origin = useRef<{ x: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const current = event.currentTarget.parentElement?.getBoundingClientRect().width ?? fallback
    origin.current = { x: event.clientX, width: current }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!origin.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    onResize(origin.current.width + (event.clientX - origin.current.x))
  }

  const stop = () => {
    origin.current = null
    setDragging(false)
  }

  return { dragging, start, move, stop }
}

function keyNextWidth(event: KeyboardEvent<HTMLDivElement>, width: number, max: number) {
  const step = event.shiftKey ? 48 : 16
  const map: Record<string, number> = {
    ArrowRight: width + step,
    ArrowLeft: width - step,
    Home: MIN_WIDTH,
    End: max,
  }
  return map[event.key]
}

/** 左侧栏宽度拖拽控制（对齐 Codex 右缘 sidebar-resize-handle-line，支持双击复原与持久化） */
export function useSidebarWidth() {
  const setStoreWidth = useAppStore((s) => s.setSidebarWidth)
  const windowWidth = useViewportWidth()
  const [preferred, setPreferred] = useState(readSavedWidth)
  const max = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, windowWidth - CENTER_MIN_WIDTH))
  const clamp = (value: number) => Math.min(max, Math.max(MIN_WIDTH, Math.round(value)))
  const width = clamp(preferred ?? DEFAULT_WIDTH)
  const resize = (next: number) => setPreferred(clamp(next))
  const { dragging, start, move, stop } = useWidthDrag(resize, width)

  useEffect(() => {
    setStoreWidth(width)
  }, [width, setStoreWidth])

  useEffect(() => {
    if (dragging) return
    try {
      if (preferred === undefined) window.localStorage.removeItem(PREF_KEY)
      else window.localStorage.setItem(PREF_KEY, String(preferred))
    } catch {
      // 忽略存储受限场景
    }
  }, [preferred, dragging])

  return {
    width,
    dragging,
    handle: {
      role: 'separator' as const,
      tabIndex: 0,
      'aria-label': '调整左侧边栏宽度',
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': MIN_WIDTH,
      'aria-valuemax': max,
      'aria-valuenow': width,
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: stop,
      onPointerCancel: stop,
      onLostPointerCapture: stop,
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        const next = keyNextWidth(event, width, max)
        if (typeof next !== 'number') return
        event.preventDefault()
        resize(next)
      },
      onDoubleClick: () => setPreferred(undefined),
    },
  }
}
