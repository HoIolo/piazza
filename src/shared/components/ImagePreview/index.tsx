import { useState } from 'react'
import { imageSource } from '@/shared/utils/image'
import { ImageLightbox, type GalleryImage } from './Lightbox'
import styles from './ImagePreview.module.css'

export type { GalleryImage }

export interface ImagePreviewProps {
  src: string
  alt?: string
  className?: string
  /** 同一组图片：查看器里可左右切换。不给就只看这一张 */
  gallery?: GalleryImage[]
  /** 本张在 gallery 里的下标 */
  index?: number
}

/** 缩略图 + 点开后的查看器。一组图共用一个查看器，点开就能左右翻 */
export function ImagePreview({
  src,
  alt = '图片',
  className,
  gallery,
  index = 0,
}: ImagePreviewProps) {
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className={`${styles.thumbnail} ${className ?? ''}`}
        onClick={() => setOpen(true)}
        aria-label={`查看图片：${alt}`}
      >
        {failed ? (
          <span>图片无法加载：{alt}</span>
        ) : (
          <img src={src} alt={alt} onError={() => setFailed(true)} />
        )}
      </button>
      {open && (
        <ImageLightbox
          images={gallery?.length ? gallery : [{ src, alt }]}
          start={index}
          close={() => setOpen(false)}
        />
      )}
    </>
  )
}

export function MessageImages({ images }: { images: Array<{ data: string; mimeType: string }> }) {
  if (!images.length) return null
  const gallery = images.map((image, index) => ({
    src: imageSource(image),
    alt: `图片 ${index + 1}`,
  }))
  return (
    <div className={styles.gallery}>
      {gallery.map((item, index) => (
        <ImagePreview key={index} src={item.src} alt={item.alt} gallery={gallery} index={index} />
      ))}
    </div>
  )
}
