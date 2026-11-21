import { useCallback, useLayoutEffect, useState } from 'react'

export interface Size {
  width: number
  height: number
}

/** 适配时四周留出的呼吸边 */
const PAD = 32

/**
 * 量出「100%」该是多大。
 *
 * 需要两个数：舞台的可视尺寸，和图片的自然尺寸。前者随窗口变化，
 * 后者要等图片解码完才知道，所以两边都从回调里更新（ResizeObserver 与
 * onLoad），而不是在 effect 里同步 setState——那会多渲染一轮。
 */
export function useFitScale(
  src: string,
  stageRef: React.RefObject<HTMLDivElement | null>,
  imageRef: React.RefObject<HTMLImageElement | null>,
) {
  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 })
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const sync = () => {
      setViewport({ width: stage.clientWidth, height: stage.clientHeight })
      // 缓存命中时 onLoad 不会再触发，顺手在这里补一次自然尺寸
      const image = imageRef.current
      if (image?.complete && image.naturalWidth) {
        setNatural({ width: image.naturalWidth, height: image.naturalHeight })
      }
    }
    // observe 会立刻回调一次，初值不必另写
    const observer = new ResizeObserver(sync)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [imageRef, stageRef])

  const measureImage = useCallback((image: HTMLImageElement) => {
    setNatural({ width: image.naturalWidth, height: image.naturalHeight })
  }, [])

  const boxW = Math.max(1, viewport.width - PAD * 2)
  const boxH = Math.max(1, viewport.height - PAD * 2)
  /*
   * 上限卡在 1：小图不放大。一张 200px 的图标铺满整屏只会又糊又空，
   * Codex 的预览同样取 min(1, ...)，100% 就是它的自然像素。
   */
  const scale =
    natural.width && natural.height ? Math.min(1, boxW / natural.width, boxH / natural.height) : 0

  return {
    viewport,
    natural,
    /** 适配尺寸：整张图刚好放进舞台 */
    fit: { width: natural.width * scale, height: natural.height * scale } as Size,
    measureImage,
    // src 换了要重新量。挂在这个 hook 上只是为了让调用方不必操心
    key: src,
  }
}
