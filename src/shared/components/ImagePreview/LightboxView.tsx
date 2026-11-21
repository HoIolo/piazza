import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ImageToolbar } from './ImageToolbar'
import type { GalleryImage } from './Lightbox'
import { useImageZoom } from './useImageZoom'
import styles from './ImagePreview.module.css'

/** 舞台与浮动控件。缩放状态挂在这一层，换图重挂即回到「适配窗口」 */
export function LightboxView({
  image,
  position,
  onPrev,
  onNext,
  onClose,
}: {
  image: GalleryImage
  position: string | null
  onPrev: (() => void) | null
  onNext: (() => void) | null
  onClose: () => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const zoom = useImageZoom(image.src, stageRef, imageRef)
  const [loaded, setLoaded] = useState(false)

  return (
    <>
      <div className={styles.toolbar}>
        {position ? <span className={styles.counter}>{position}</span> : <span />}
        <ImageToolbar
          percent={zoom.actualPercent}
          zoom={zoom.zoom}
          src={image.src}
          alt={image.alt}
          onFit={zoom.fitToWindow}
          onZoomTo={zoom.zoomTo}
          onClose={onClose}
        />
      </div>

      {onPrev && (
        <button
          type="button"
          className={styles.nav}
          data-side="prev"
          aria-label="上一张图片"
          title="上一张（←）"
          onClick={onPrev}
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {onNext && (
        <button
          type="button"
          className={styles.nav}
          data-side="next"
          aria-label="下一张图片"
          title="下一张（→）"
          onClick={onNext}
        >
          <ChevronRight size={20} />
        </button>
      )}

      <div
        ref={stageRef}
        className={styles.stage}
        data-panning={zoom.panning}
        {...zoom.stageHandlers}
        onClick={(event) => {
          /*
           * 点空白处关闭。拖拽结束时浏览器照样派发 click，
           * 得靠 didDrag 把它认出来——否则放大后一拖就把查看器关了。
           */
          if (event.target === event.currentTarget && !zoom.didDrag) onClose()
        }}
      >
        {!loaded && <span className={styles.loading}>正在加载图片…</span>}
        <img
          ref={imageRef}
          className={styles.image}
          src={image.src}
          alt={image.alt}
          draggable={false}
          onLoad={(event) => {
            zoom.measureImage(event.currentTarget)
            setLoaded(true)
          }}
          style={{
            // 尺寸由「适配尺寸 × 适配倍数」算出，100% 正好铺满舞台
            width: zoom.fit.width ? zoom.fit.width * zoom.zoom : 'auto',
            height: zoom.fit.height ? zoom.fit.height * zoom.zoom : 'auto',
            maxWidth: 'none',
            maxHeight: 'none',
            visibility: loaded ? 'visible' : 'hidden',
          }}
        />
      </div>
    </>
  )
}
