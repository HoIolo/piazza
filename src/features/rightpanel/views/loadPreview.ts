import { attachmentFromPath } from '@/shared/api/attachments'
import { previewWorkspaceFile } from '@/shared/api/files'
import { imageSource } from '@/shared/utils/image'

export type FileContent = { content: string } | { image: string } | { error: string }

export async function loadPreview(cwd: string, path: string): Promise<FileContent> {
  if (/\.(png|jpe?g|gif|webp)$/i.test(path)) {
    const absolute = path.startsWith('/') ? path : `${cwd.replace(/\/$/, '')}/${path}`
    const file = await attachmentFromPath(absolute)
    if (file.image) return { image: imageSource(file.image) }
  }
  return { content: await previewWorkspaceFile(cwd, path) }
}
