import { invoke, isTauri } from '@tauri-apps/api/core'
import type { ImageContent } from '@/rpc/types'

export interface DraftAttachment {
  id: string
  name: string
  size: number
  path?: string
  image?: ImageContent
  text?: string
}

interface NativeAttachment {
  name: string
  path: string
  size: number
  mimeType: string | null
  data: string | null
}

function fromNative(file: NativeAttachment): DraftAttachment {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    path: file.path,
    ...(file.mimeType && file.data
      ? { image: { type: 'image' as const, mimeType: file.mimeType, data: file.data } }
      : {}),
  }
}

export async function attachmentFromPath(path: string): Promise<DraftAttachment> {
  return fromNative(await invoke<NativeAttachment>('read_attachment', { path }))
}

export async function attachmentFromFile(file: File): Promise<DraftAttachment> {
  if (file.size > 20 * 1024 * 1024) throw new Error('附件不能超过 20 MB')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`))
    reader.readAsDataURL(file)
  })
  const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
  if (isTauri())
    return fromNative(await invoke<NativeAttachment>('store_attachment', { name: file.name, data }))
  if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    return {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      image: { type: 'image', data, mimeType: file.type },
    }
  }
  if (
    /^text\//.test(file.type) ||
    /\.(txt|md|json|csv|ts|tsx|js|jsx|css|html|py|rs|yaml|yml|xml|log)$/i.test(file.name)
  ) {
    return { id: crypto.randomUUID(), name: file.name, size: file.size, text: await file.text() }
  }
  throw new Error('请在桌面应用中添加此类型的文件')
}

export function prepareAttachments(text: string, attachments: DraftAttachment[]) {
  const references = attachments.flatMap((file) => {
    if (file.text !== undefined) return [`[${file.name}]\n${file.text}\n[/${file.name}]`]
    return file.path && !file.image ? [`文件：${JSON.stringify(file.path)}`] : []
  })
  return {
    message: [text.trim(), ...references].filter(Boolean).join('\n\n'),
    images: attachments.flatMap((file) => (file.image ? [file.image] : [])),
  }
}
