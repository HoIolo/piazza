import type { ImageContent } from '@/rpc/types'

export function imageSource(image: Pick<ImageContent, 'data' | 'mimeType'>): string {
  return `data:${image.mimeType};base64,${image.data}`
}
