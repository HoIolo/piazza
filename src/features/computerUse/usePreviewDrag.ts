import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { PreviewPosition } from '@/store/computerUse.store'

const EDGE_MARGIN = 12
const MIN_VISIBLE_HEIGHT = 220

interface DragState {
  startX: number
  startY: number
  originX: number
  originY: number
  width: number
  height: number
}

function clampPosition(x: number, y: number, width: number, height: number): PreviewPosition {
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN)
  const safeHeight = Math.min(height, MIN_VISIBLE_HEIGHT)
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - safeHeight - EDGE_MARGIN)
  return {
    x: Math.min(maxX, Math.max(EDGE_MARGIN, x)),
    y: Math.min(maxY, Math.max(EDGE_MARGIN, y)),
  }
}

function isDraggableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('button, [data-no-drag="true"]')) return false
  return Boolean(target.closest('[data-drag-handle="true"]'))
}

function useViewportClamp(
  containerRef: RefObject<HTMLDivElement | null>,
  position: PreviewPosition | null,
  setPosition: (next: PreviewPosition | null) => void,
) {
  useEffect(() => {
    if (!position) return
    const onResize = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      setPosition(clampPosition(position.x, position.y, rect.width, rect.height))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [containerRef, position, setPosition])
}

function useWindowDragListeners(
  isDragging: boolean,
  dragRef: MutableRefObject<DragState | null>,
  setIsDragging: (dragging: boolean) => void,
  setPosition: (next: PreviewPosition | null) => void,
) {
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const nextX = drag.originX + (e.clientX - drag.startX)
      const nextY = drag.originY + (e.clientY - drag.startY)
      setPosition(clampPosition(nextX, nextY, drag.width, drag.height))
    }
    const onEnd = () => {
      dragRef.current = null
      setIsDragging(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
  }, [isDragging, dragRef, setIsDragging, setPosition])
}

/**
 * 浮窗拖拽（Window Pointer 事件）：
 * 兼容 SVG 子节点点击，避免 WKWebView 下 setPointerCapture 丢失移动事件。
 */
export function usePreviewDrag(
  containerRef: RefObject<HTMLDivElement | null>,
  position: PreviewPosition | null,
  setPosition: (next: PreviewPosition | null) => void,
) {
  const dragRef = useRef<DragState | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useViewportClamp(containerRef, position, setPosition)
  useWindowDragListeners(isDragging, dragRef, setIsDragging, setPosition)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !isDraggableTarget(e.target)) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: position?.x ?? rect.left,
      originY: position?.y ?? rect.top,
      width: rect.width,
      height: rect.height,
    }
    setIsDragging(true)
  }

  return { onPointerDown, isDragging }
}
