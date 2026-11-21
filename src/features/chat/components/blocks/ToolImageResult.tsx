import { useRef, useState } from 'react'
import { useScrollEdges } from '@/shared/hooks/useScrollEdges'
import type { ImageContent } from '@/rpc/types'
import { CodexIcon } from '@/design/icons/CodexIcon'
import { ImagePreview } from '@/shared/components/ImagePreview'
import { imageSource } from '@/shared/utils/image'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import styles from './ToolImageResult.module.css'

export function ToolImageResult({
  images,
  running = false,
}: {
  images: ImageContent[]
  running?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)
  const galleryRef = useRef<HTMLDivElement>(null)
  const edges = useScrollEdges(galleryRef, expanded)
  // 同一行里的缩略图属于一相册：点开后能直接左右翻，不用退出来再点下一张
  const gallery = images.map((image, index) => ({
    src: imageSource(image),
    alt: `已查看的图像 ${index + 1}`,
  }))
  return (
    <div className={styles.block}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => {
          setOpened(true)
          setExpanded((value) => !value)
        }}
        aria-expanded={expanded}
      >
        <CodexIcon name="photos" size={16} />
        {running ? (
          <ShimmerText>正在查看图像</ShimmerText>
        ) : (
          <span>已查看 {images.length} 张图像</span>
        )}
        <CodexIcon name="chevron" size={12} className={styles.chevron} />
      </button>
      <div className={styles.galleryWrap} data-expanded={expanded} inert={!expanded}>
        <div className={styles.clip}>
          {(expanded || opened) && (
            <div
              className={styles.gallery}
              ref={galleryRef}
              data-edge-top={edges.top}
              data-edge-bottom={edges.bottom}
            >
              {gallery.map((item, index) => (
                <ImagePreview
                  key={index}
                  className={styles.thumbnail}
                  src={item.src}
                  alt={item.alt}
                  gallery={gallery}
                  index={index}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
