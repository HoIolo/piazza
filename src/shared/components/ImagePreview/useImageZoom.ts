import { useCallback, useLayoutEffect, useState } from 'react'
import { useFitScale, type Size } from './useFitScale'
import { flushAnchor, useStageGestures } from './useStageGestures'
import { clampZoom } from './zoomMath'

export { MAX_ZOOM, MIN_ZOOM, ZOOM_STEPS } from './zoomMath'

export interface ImageZoom {
  /** 适配倍数，1 ＝ 整张图刚好铺满舞台 */
  zoom: number
  fit: Size
  /** 真实像素比，1 表示 1:1 */
  actualPercent: number
  zoomTo: (next: number) => void
  fitToWindow: () => void
  panning: boolean
  /** 刚才那一下是拖拽而不是点击，用来区分「拖完」与「点空白关闭」 */
  didDrag: boolean
  measureImage: (image: HTMLImageElement) => void
  stageHandlers: {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
    onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void
  }
}

/**
 * 图片的缩放与平移。
 *
 * 缩放值以「适配窗口」为 1 记，而不是按原始像素：一张 4000px 的截图和
 * 一张 400px 的小图，用户心里的 100% 都是「正好看全」。真要看原始像素，
 * 工具栏里另给一档。
 */
export function useImageZoom(
  src: string,
  stageRef: React.RefObject<HTMLDivElement | null>,
  imageRef: React.RefObject<HTMLImageElement | null>,
): ImageZoom {
  const { fit, natural, measureImage } = useFitScale(src, stageRef, imageRef)
  const [state, setState] = useState({ src, zoom: 1 })

  /*
   * 缩放值记住「它属于哪张图」：相册里翻页后读到的就是 1，
   * 不必在 effect 里再 setState 归位一次——那会多渲染一轮，
   * 且下一张会先按上一张的倍数闪一帧。
   */
  const zoom = state.src === src ? state.zoom : 1
  const setZoom = useCallback<React.Dispatch<React.SetStateAction<number>>>(
    (next) => {
      setState((prev) => {
        const from = prev.src === src ? prev.zoom : 1
        const value = typeof next === 'function' ? next(from) : next
        return { src, zoom: clampZoom(value) }
      })
    },
    [src],
  )

  /*
   * 缩放改的是图片的 width/height，浏览器要等这一帧排完版才知道新尺寸。
   * 锚点修正在这里做——放进滚轮回调里改 scrollLeft，读到的还是旧尺寸，
   * 滚动量会被夹回旧边界，表现为「滚了但图没动」。
   */
  useLayoutEffect(flushAnchor, [zoom])

  const fitToWindow = useCallback(() => {
    setZoom(1)
    // 等这一帧按新尺寸排完版再居中，否则会停在旧位置
    requestAnimationFrame(() => {
      const stage = stageRef.current
      if (!stage) return
      stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2
      stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2
    })
  }, [setZoom, stageRef])

  const gestures = useStageGestures(stageRef, imageRef, zoom, setZoom, fitToWindow)

  /** 显示尺寸下，一个自然像素占几个屏幕像素。1 表示 1:1 */
  const actualPercent = natural.width ? (fit.width * zoom) / natural.width : 1

  const zoomTo = useCallback((next: number) => setZoom(clampZoom(next)), [setZoom])

  return {
    zoom,
    fit,
    actualPercent,
    zoomTo,
    fitToWindow,
    panning: gestures.panning,
    didDrag: gestures.didDrag,
    measureImage,
    stageHandlers: gestures.handlers,
  }
}
