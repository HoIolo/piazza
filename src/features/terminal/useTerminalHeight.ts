import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

const PREF_KEY = 'piazza.terminal-height'
const MIN_HEIGHT = 160
const DEFAULT_HEIGHT = 300
const CHAT_MIN_HEIGHT = 240

function readHeight(): number | undefined {
  try {
    const value = Number(window.localStorage.getItem(PREF_KEY))
    return Number.isFinite(value) && value > 0 ? value : undefined
  } catch {
    return undefined
  }
}

function useViewportHeight() {
  const [height, setHeight] = useState(() => window.innerHeight)
  useEffect(() => {
    const resize = () => setHeight(window.innerHeight)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  return height
}

function useDrag(onResize: (height: number) => void, fallback: number) {
  const origin = useRef<{ y: number; height: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const height = event.currentTarget.parentElement?.getBoundingClientRect().height ?? fallback
    origin.current = { y: event.clientY, height }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (origin.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      onResize(origin.current.height + origin.current.y - event.clientY)
    }
  }
  const stop = () => {
    origin.current = null
    setDragging(false)
  }
  return { dragging, start, move, stop }
}

function keyHeight(event: KeyboardEvent<HTMLDivElement>, height: number, max: number) {
  const step = event.shiftKey ? 64 : 16
  const values: Record<string, number> = {
    ArrowUp: height + step,
    ArrowDown: height - step,
    Home: MIN_HEIGHT,
    End: max,
  }
  return values[event.key]
}

function useSaveHeight(preferred: number | undefined, dragging: boolean) {
  useEffect(() => {
    if (dragging) return
    try {
      if (preferred === undefined) window.localStorage.removeItem(PREF_KEY)
      else window.localStorage.setItem(PREF_KEY, String(preferred))
    } catch {
      // 关闭持久存储时仍可在本次运行中调整
    }
  }, [preferred, dragging])
}

export function useTerminalHeight() {
  const windowHeight = useViewportHeight()
  const [preferred, setPreferred] = useState(readHeight)
  const max = Math.max(MIN_HEIGHT, windowHeight - CHAT_MIN_HEIGHT)
  const clamp = (h: number) => Math.min(max, Math.max(MIN_HEIGHT, Math.round(h)))
  const height = clamp(preferred ?? DEFAULT_HEIGHT)
  const resize = (next: number) => setPreferred(clamp(next))
  const { dragging, start, move, stop } = useDrag(resize, height)
  useSaveHeight(preferred, dragging)

  return {
    height,
    dragging,
    handle: {
      role: 'separator',
      tabIndex: 0,
      'aria-label': '调整底部终端高度',
      'aria-orientation': 'horizontal' as const,
      'aria-valuemin': MIN_HEIGHT,
      'aria-valuemax': max,
      'aria-valuenow': height,
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: stop,
      onPointerCancel: stop,
      onLostPointerCapture: stop,
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        const value = keyHeight(event, height, max)
        if (typeof value !== 'number') return
        event.preventDefault()
        resize(value)
      },
      onDoubleClick: () => setPreferred(undefined),
    },
  }
}
