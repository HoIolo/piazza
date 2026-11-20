import { useEffect, useState } from 'react'
import { attachmentFromPath } from '@/shared/api/attachments'
import { imageSource } from '@/shared/utils/image'
import { ImagePreview } from '@/shared/components/ImagePreview'

export function MarkdownImage({
  src,
  alt = '图片',
  cwd,
}: {
  src: string
  alt?: string
  cwd: string | null
}) {
  const remote = /^(https?:|data:image\/)/i.test(src)
  const [result, setResult] = useState<{ src: string } | { error: string }>()
  useEffect(() => {
    if (remote || !src) return
    let current = true
    const decoded = decodeURIComponent(src.replace(/^file:\/\//, ''))
    const path = decoded.startsWith('/') || !cwd ? decoded : `${cwd}/${decoded}`
    void attachmentFromPath(path).then(
      (file) => {
        if (current)
          setResult(
            file.image ? { src: imageSource(file.image) } : { error: '文件不是可预览的图片' },
          )
      },
      () => {
        if (current) setResult({ error: '图片无法加载' })
      },
    )
    return () => {
      current = false
    }
  }, [src, cwd, remote])
  const resolved = remote ? src : result && 'src' in result ? result.src : null
  if (!resolved)
    return (
      <span role="status">
        {result && 'error' in result ? result.error : '正在读取图片…'}：{alt}
      </span>
    )
  return <ImagePreview src={resolved} alt={alt} />
}
