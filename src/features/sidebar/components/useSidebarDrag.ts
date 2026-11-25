import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MouseEvent, PointerEvent, RefObject, SetStateAction } from 'react'
import { reorderPaths } from '../projectOrder'
import { autoScrollTree, DRAG_ACTIVATION_PX, hitTestSortItem, isInteractiveTarget } from './projectDrag'

export interface ActiveSidebarDrag {
  kind: 'project' | 'session'
  cwd: string | null
  from: string
  over: string | null
  offsetY: number
}

export interface ReorderHandlers {
  onReorder: (order: string[]) => void
  onReorderSessions: (cwd: string, order: string[]) => void
}

export interface DragStartSpec {
  kind: 'project' | 'session'
  cwd: string | null
  from: string
  pinned: boolean
  items: string[]
}

interface PendingDrag extends DragStartSpec {
  container: HTMLElement | null
  startX: number
  startY: number
  startScrollTop: number
  activated: boolean
  over: string | null
}

function hitTarget(pending: PendingDrag, clientY: number): string | null {
  const pin = pending.pinned ? 'true' : 'false'
  const attr = pending.kind === 'project' ? 'data-project-node' : 'data-session-path'
  return hitTestSortItem(pending.container, `[${attr}][data-pinned="${pin}"]`, attr, clientY)
}

function commitReorder(pending: PendingDrag, handlers: ReorderHandlers) {
  if (!pending.over || pending.over === pending.from) return
  const next = reorderPaths(pending.items, pending.from, pending.over)
  if (next === pending.items) return
  if (pending.kind === 'project') handlers.onReorder(next)
  else if (pending.cwd) handlers.onReorderSessions(pending.cwd, next)
}

function attachDragListeners(
  pending: PendingDrag,
  treeRef: RefObject<HTMLDivElement | null>,
  handlersRef: RefObject<ReorderHandlers>,
  setDrag: Dispatch<SetStateAction<ActiveSidebarDrag | null>>,
  onSettled: (activated: boolean) => void,
): () => void {
  let active: PendingDrag | null = pending

  const finish = (commit: boolean) => {
    cleanup()
    const curr = active
    active = null
    setDrag(null)
    if (!curr) return
    onSettled(curr.activated)
    if (commit && curr.activated) commitReorder(curr, handlersRef.current)
  }

  const onMove = (e: globalThis.PointerEvent) => {
    if (!active) return
    const dy = e.clientY - active.startY
    if (!active.activated) {
      if (Math.hypot(e.clientX - active.startX, dy) < DRAG_ACTIVATION_PX) return
      active.activated = true
      window.getSelection()?.removeAllRanges()
    }
    e.preventDefault()
    autoScrollTree(treeRef.current, e.clientY)
    const offsetY = dy + ((treeRef.current?.scrollTop ?? 0) - active.startScrollTop)
    active.over = hitTarget(active, e.clientY)
    setDrag({ kind: active.kind, cwd: active.cwd, from: active.from, over: active.over, offsetY })
  }
  const onUp = () => finish(true)
  const onCancel = () => finish(false)
  const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && finish(false)
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKey)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKey)
  return cleanup
}

/**
 * 基于 Pointer Events 的侧栏纵向拖拽排序（对齐 Codex Electron 的 @dnd-kit PointerSensor 逻辑）：
 * - 6px 位移阈值触发，不影响普通点击；
 * - 绕开 Tauri v2 原生 dragDropEnabled 对 HTML5 draggable 的拦截，macOS/Windows 均稳定；
 * - 置顶区与普通区各自闭环命中，避免指示线误导；自动滚动时补偿 scrollTop 保持 1:1 跟手。
 */
export function useSidebarDrag(
  treeRef: RefObject<HTMLDivElement | null>,
  handlers: ReorderHandlers,
) {
  const [drag, setDrag] = useState<ActiveSidebarDrag | null>(null)
  const suppressClickUntilRef = useRef(0)
  const handlersRef = useRef(handlers)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])
  useEffect(() => () => cleanupRef.current?.(), [])

  const startDrag = useCallback(
    (event: PointerEvent<HTMLElement>, spec: DragStartSpec) => {
      if (event.button !== 0 || isInteractiveTarget(event.target)) return
      const container =
        spec.kind === 'project'
          ? treeRef.current
          : event.currentTarget.closest<HTMLElement>('[data-session-list]')
      cleanupRef.current?.()
      const startScrollTop = treeRef.current?.scrollTop ?? 0
      cleanupRef.current = attachDragListeners(
        { ...spec, container, startX: event.clientX, startY: event.clientY, startScrollTop, activated: false, over: null },
        treeRef,
        handlersRef,
        setDrag,
        (activated) => {
          cleanupRef.current = null
          if (activated) suppressClickUntilRef.current = Date.now() + 200
        },
      )
    },
    [treeRef],
  )

  const onClickCapture = useCallback((event: MouseEvent) => {
    if (Date.now() < suppressClickUntilRef.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }, [])

  return { drag, startDrag, onClickCapture }
}
