import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useAppStore } from '@/store/app.store'

const PREF_KEY = 'piazza.workspace-width'
const MIN_WIDTH = 280
const CHAT_MIN_WIDTH = 300

function readWidth(): number | undefined {
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
    const resize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  return width
}

function useDrag(onResize: (width: number) => void, fallback: number) {
  const origin = useRef<{ x: number; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const width = event.currentTarget.parentElement?.getBoundingClientRect().width ?? fallback
    origin.current = { x: event.clientX, width }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (origin.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      onResize(origin.current.width + origin.current.x - event.clientX)
    }
  }
  const stop = () => {
    origin.current = null
    setDragging(false)
  }
  return { dragging, start, move, stop }
}

function keyWidth(event: KeyboardEvent<HTMLDivElement>, width: number, max: number) {
  const step = event.shiftKey ? 64 : 16
  const values: Record<string, number> = {
    ArrowLeft: width + step,
    ArrowRight: width - step,
    Home: MIN_WIDTH,
    End: max,
  }
  return values[event.key]
}

function useSaveWidth(preferred: number | undefined, dragging: boolean) {
  useEffect(() => {
    if (dragging) return
    try {
      if (preferred === undefined) window.localStorage.removeItem(PREF_KEY)
      else window.localStorage.setItem(PREF_KEY, String(preferred))
    } catch {
      // 关闭持久存储时仍可在本次运行中调整。
    }
  }, [preferred, dragging])
}

export function usePanelWidth() {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  const storedSidebarWidth = useAppStore((state) => state.sidebarWidth)
  const windowWidth = useViewportWidth()
  const [preferred, setPreferred] = useState(readWidth)
  const sidebarWidth = sidebarOpen ? storedSidebarWidth : 0
  const max = Math.max(MIN_WIDTH, windowWidth - sidebarWidth - CHAT_MIN_WIDTH)
  const clamp = (width: number) => Math.min(max, Math.max(MIN_WIDTH, Math.round(width)))
  const width = clamp(preferred ?? Math.min(440, windowWidth * 0.36))
  const resize = (next: number) => setPreferred(clamp(next))
  const { dragging, start, move, stop } = useDrag(resize, width)
  useSaveWidth(preferred, dragging)

  return {
    width,
    dragging,
    handle: {
      role: 'separator',
      tabIndex: 0,
      'aria-label': '调整右侧工作区宽度',
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
        const value = keyWidth(event, width, max)
        if (typeof value !== 'number') return
        event.preventDefault()
        resize(value)
      },
      onDoubleClick: () => setPreferred(undefined),
    },
  }
}
