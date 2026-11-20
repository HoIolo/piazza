import { useState } from 'react'
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
  return (
    <div className={styles.block}>
      <button
        type="button"
        className={styles.summary}
        onClick={() => setExpanded((value) => !value)}
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
          <div className={styles.gallery}>
            {images.map((image, index) => (
              <ImagePreview
                key={index}
                className={styles.thumbnail}
                src={imageSource(image)}
                alt={`已查看的图像 ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
