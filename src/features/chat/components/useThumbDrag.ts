import type { PointerEvent, RefObject } from 'react'
import { applyThumbDrag, type DragOrigin, type Metrics } from './scrollThumbGeometry'

/** 悬停只影响「显隐」和「拖拽中不自动隐藏」，与位移计算无关，单独一块 */
function makeHoverHandlers(
  hoveringRef: { current: boolean },
  dragRef: { current: DragOrigin | null },
  setShown: (v: boolean) => void,
) {
  const hover = (next: boolean) => () => {
    hoveringRef.current = next
    if (!next && !dragRef.current) setShown(false)
  }
  return { onPointerEnter: hover(true), onPointerLeave: hover(false) }
}

/** 拖拽与悬停：指针事件全部收敛在这里，组件只负责渲染 */
export function useThumbDrag(
  refs: {
    containerRef: RefObject<HTMLDivElement | null>
    metricsRef: { current: Metrics }
    dragRef: { current: DragOrigin | null }
    hoveringRef: { current: boolean }
  },
  hooks: {
    setShown: (v: boolean) => void
    setDragging: (v: boolean) => void
    onDragScroll?: (direction: 'up' | 'down') => void
  },
) {
  const { containerRef, metricsRef, dragRef, hoveringRef } = refs
  const { setShown, setDragging, onDragScroll } = hooks

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
    if (containerRef.current && dragRef.current) {
      applyThumbDrag(
        containerRef.current,
        dragRef.current,
        metricsRef.current,
        e.clientY,
        onDragScroll,
      )
    }
  }

  const onPointerUp = () => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    if (!hoveringRef.current) setShown(false)
  }

  return {
    ...makeHoverHandlers(hoveringRef, dragRef, setShown),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  }
}
