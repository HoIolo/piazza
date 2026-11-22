import type { RefObject } from 'react'
import { useScrollThumb } from './useScrollThumb'
import styles from './ScrollThumb.module.css'

/** 覆盖式滚动条滑块：仅在滚动或拖拽时显现，停止后平滑淡出 */
export function ScrollThumb({
  containerRef,
  onDragScroll,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  onDragScroll?: (direction: 'up' | 'down') => void
}) {
  const { thumbRef, shown, dragging, handlers } = useScrollThumb(containerRef, onDragScroll)

  return (
    <div
      ref={thumbRef}
      className={styles.thumb}
      data-visible={shown || dragging}
      data-dragging={dragging}
      {...handlers}
      aria-hidden="true"
    />
  )
}
