import { useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/** 浮层与触发器之间的缝，浮层离窗口边缘的最小距离，以及默认最大高度 */
const GAP = 6
const EDGE = 8
export const DEFAULT_MAX_HEIGHT = 360

export interface Placement {
  side: 'top' | 'bottom'
  style: CSSProperties
}

/** 按触发器位置算出浮层该放哪。首选方向放不下且另一侧更宽裕时翻面 */
function place(
  anchor: DOMRect,
  panelHeight: number,
  preferred: 'top' | 'bottom',
  align: 'start' | 'end',
  maxCap: number,
): Placement {
  const above = anchor.top - GAP - EDGE
  const below = window.innerHeight - anchor.bottom - GAP - EDGE
  const fits = preferred === 'top' ? panelHeight <= above : panelHeight <= below
  const side = fits ? preferred : above > below ? 'top' : 'bottom'

  const available = side === 'top' ? above : below
  const style: CSSProperties = { maxHeight: Math.max(120, Math.min(available, maxCap)) }
  if (side === 'top') style.bottom = window.innerHeight - anchor.top + GAP
  else style.top = anchor.bottom + GAP
  if (align === 'start') style.left = Math.max(EDGE, anchor.left)
  else style.right = Math.max(EDGE, window.innerWidth - anchor.right)
  return { side, style }
}

export function usePopoverPlacement(
  open: boolean,
  side: 'top' | 'bottom',
  align: 'start' | 'end',
  maxHeight: number,
  rootRef: RefObject<HTMLDivElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
) {
  const [placement, setPlacement] = useState<Placement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const anchor = rootRef.current?.getBoundingClientRect()
      const panel = panelRef.current
      if (anchor && panel) setPlacement(place(anchor, panel.scrollHeight, side, align, maxHeight))
    }
    update()
    const observer = new ResizeObserver(update)
    if (panelRef.current) observer.observe(panelRef.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      setPlacement(null)
    }
  }, [open, side, align, maxHeight, rootRef, panelRef])

  return placement
}

export function usePopoverDismiss(
  open: boolean,
  rootRef: RefObject<HTMLDivElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  nested: RefObject<Set<HTMLElement>>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      const inside =
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target) ||
        [...nested.current].some((el) => el.contains(target))
      if (!inside) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, rootRef, panelRef, nested, onClose])
}
