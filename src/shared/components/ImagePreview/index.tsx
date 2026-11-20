import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, X, Download } from 'lucide-react'
import { useModalDialog } from '@/shared/hooks/useModalDialog'
import { imageSource } from '@/shared/utils/image'
import styles from './ImagePreview.module.css'

export function ImagePreview({
  src,
  alt = '图片',
  className,
}: {
  src: string
  alt?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
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
      {open && <ImageLightbox src={src} alt={alt} close={() => setOpen(false)} />}
    </>
  )
}

function ImageLightbox({ src, alt, close }: { src: string; alt: string; close: () => void }) {
  const [zoom, setZoom] = useState(1)
  const modal = useModalDialog(close)
  return createPortal(
    <dialog
      {...modal}
      className={styles.lightbox}
      aria-label={alt}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <header className={styles.toolbar}>
        <span>{alt}</span>
        <button
          type="button"
          aria-label="缩小图片"
          disabled={zoom <= 0.5}
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >
          <Minus size={18} />
        </button>
        <button type="button" onClick={() => setZoom(1)} aria-label="重置图片缩放">
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="放大图片"
          disabled={zoom >= 3}
          onClick={() => setZoom(Math.min(3, zoom + 0.25))}
        >
          <Plus size={18} />
        </button>
        <a href={src} download={alt} aria-label="保存图片">
          <Download size={18} />
        </a>
        <button type="button" aria-label="关闭图片预览" onClick={close}>
          <X size={20} />
        </button>
      </header>
      <div
        className={styles.stage}
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <img src={src} alt={alt} style={{ transform: `scale(${zoom})` }} />
      </div>
    </dialog>,
    document.body,
  )
}

export function MessageImages({ images }: { images: Array<{ data: string; mimeType: string }> }) {
  if (!images.length) return null
  return (
    <div className={styles.gallery}>
      {images.map((image, index) => (
        <ImagePreview key={index} src={imageSource(image)} alt={`图片 ${index + 1}`} />
      ))}
    </div>
  )
}
