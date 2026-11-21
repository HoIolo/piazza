import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LightboxView } from './LightboxView'
import styles from './ImagePreview.module.css'

export interface GalleryImage {
  src: string
  alt: string
}

/** 打开动画的长度。关闭要等反向动画播完再卸载，硬切会闪一下 */
const CLOSE_MS = 140

/**
 * 图片查看器：整窗半透明遮罩 + 居中的图片，右上角一排浮动控件。
 *
 * 用自绘浮层而不是 <dialog>：<dialog> 的遮罩由浏览器画在顶层，没法加模糊
 * 与渐入，也没法让图片从略小的尺寸弹出来——而这两样正是「打开查看器」
 * 这件事的手感来源。
 *
 * 一组图（相册、消息里的多张图）时左右给箭头、方向键也能翻页，对齐 Codex 的预览；
 * 这一层只管「第几张、怎么关」，缩放与舞台交给随图重挂的 LightboxView。
 */
export function ImageLightbox({
  images,
  start,
  close,
}: {
  images: GalleryImage[]
  start: number
  close: () => void
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(() => Math.min(Math.max(start, 0), images.length - 1))
  const [closing, setClosing] = useState(false)
  const current = images[index] ?? images[0]
  const hasPrev = index > 0
  const hasNext = index < images.length - 1

  const requestClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    // 动画结束再交给父组件卸载；定时器兜底，动画被跳过时也关得掉
    window.setTimeout(close, CLOSE_MS)
  }, [close, closing])

  const step = useCallback(
    (delta: number) => setIndex((value) => Math.min(Math.max(value + delta, 0), images.length - 1)),
    [images.length],
  )

  /* Esc 关闭、左右方向键翻页；同时把焦点收进遮罩，键盘用户不会还停在背后的消息上 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      if (delta !== 0 && ((delta < 0 && hasPrev) || (delta > 0 && hasNext))) {
        event.preventDefault()
        event.stopPropagation()
        step(delta)
        return
      }
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      requestClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    overlayRef.current?.focus()
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [hasNext, hasPrev, requestClose, step])

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      data-closing={closing}
      data-nav={images.length > 1}
      role="dialog"
      aria-modal="true"
      aria-label={`图片预览：${current.alt}`}
      tabIndex={-1}
    >
      {/* key 随这一格变：换图即重挂舞台，缩放与滚动位置一起归位 */}
      <LightboxView
        key={`${index}:${current.src}`}
        image={current}
        position={images.length > 1 ? `${index + 1} / ${images.length}` : null}
        onPrev={hasPrev ? () => step(-1) : null}
        onNext={hasNext ? () => step(1) : null}
        onClose={requestClose}
      />
    </div>,
    document.body,
  )
}
