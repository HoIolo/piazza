import { useCallback, useEffect, useRef, useState } from 'react'
import { clampZoom, WHEEL_INTENSITY, anchorAt, applyAnchor, type ZoomAnchor } from './zoomMath'

type StageRef = React.RefObject<HTMLDivElement | null>
type ImageRef = React.RefObject<HTMLImageElement | null>
type SetZoom = React.Dispatch<React.SetStateAction<number>>

/** 按住拖动平移：改的是舞台的滚动位置，而不是图片的 transform */
function useDragPan(stageRef: StageRef, setPanning: React.Dispatch<React.SetStateAction<boolean>>) {
  // 拖拽起点与起始滚动量。放 ref 而不是 state：移动时每帧都要读，不该触发重渲染
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [dragged, setDragged] = useState(false)

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // 只接左键；右键留给系统菜单
      if (event.button !== 0) return
      const stage = stageRef.current
      if (!stage) return
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        left: stage.scrollLeft,
        top: stage.scrollTop,
      }
      setDragged(false)
      setPanning(true)
      stage.setPointerCapture(event.pointerId)
    },
    [setPanning, stageRef],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = drag.current
      const stage = stageRef.current
      if (!start || !stage) return
      if (Math.abs(event.clientX - start.x) > 3 || Math.abs(event.clientY - start.y) > 3) {
        setDragged(true)
      }
      stage.scrollLeft = start.left - (event.clientX - start.x)
      stage.scrollTop = start.top - (event.clientY - start.y)
    },
    [stageRef],
  )

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return
      drag.current = null
      setPanning(false)
      stageRef.current?.releasePointerCapture(event.pointerId)
    },
    [setPanning, stageRef],
  )

  return { dragged, onPointerDown, onPointerMove, onPointerUp }
}

/**
 * 滚轮缩放。
 *
 * 必须用原生监听并显式 passive: false：React 的 onWheel 是 passive 的，
 * 里面 preventDefault() 会被忽略——缩放生效的同时舞台还在滚，图片跟着跑偏。
 */
function useWheelZoom(stageRef: StageRef, imageRef: ImageRef, setZoom: SetZoom) {
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      // 触控板横向滚动也并进来，两指缩放与普通滚轮走同一套换算
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (delta === 0) return
      event.preventDefault()
      const intensity = event.ctrlKey ? WHEEL_INTENSITY.pinch : WHEEL_INTENSITY.wheel
      const anchor = anchorAt(imageRef.current, event.clientX, event.clientY)
      setZoom((prev) => {
        const next = clampZoom(prev * Math.exp(-delta * intensity))
        if (next !== prev && anchor) {
          // 尺寸这一帧还没变，先把锚点挂到下一个 layout effect 上
          queueAnchor(stage, imageRef.current, anchor)
        }
        return next
      })
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [imageRef, setZoom, stageRef])
}

/** 待修正的锚点。滚轮事件里没有 setState 回调之外的同步时机，只能先存着 */
let pendingAnchor: { stage: HTMLElement; image: HTMLElement | null; anchor: ZoomAnchor } | null =
  null

function queueAnchor(stage: HTMLElement, image: HTMLElement | null, anchor: ZoomAnchor): void {
  pendingAnchor = { stage, image, anchor }
}

/** 把排队中的锚点修正应用到 DOM 上。由组件的 layout effect 在尺寸生效后调用 */
export function flushAnchor(): void {
  const task = pendingAnchor
  pendingAnchor = null
  if (task) applyAnchor(task.stage, task.image, task.anchor)
}

/**
 * 舞台上的手势：滚轮缩放、拖拽平移、双击在「适配」与「2 倍」之间来回。
 */
export function useStageGestures(
  stageRef: StageRef,
  imageRef: ImageRef,
  zoom: number,
  setZoom: SetZoom,
  fitToWindow: () => void,
) {
  const [panning, setPanning] = useState(false)
  useWheelZoom(stageRef, imageRef, setZoom)
  const drag = useDragPan(stageRef, setPanning)

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (zoom > 1.01) {
        fitToWindow()
        return
      }
      const anchor = anchorAt(imageRef.current, event.clientX, event.clientY)
      setZoom((prev) => {
        const next = clampZoom(2)
        const stage = stageRef.current
        if (next !== prev && stage && anchor) queueAnchor(stage, imageRef.current, anchor)
        return next
      })
    },
    [fitToWindow, imageRef, setZoom, stageRef, zoom],
  )

  return {
    panning,
    /** 这一次手势是否真的拖动过，用来区分「拖完」与「点空白关闭」 */
    didDrag: drag.dragged,
    handlers: {
      onPointerDown: drag.onPointerDown,
      onPointerMove: drag.onPointerMove,
      onPointerUp: drag.onPointerUp,
      onDoubleClick,
    },
  }
}
