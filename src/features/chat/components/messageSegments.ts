import type { ContentBlock, ImageContent } from '@/rpc/types'

export type MessageSegment =
  | { kind: 'text'; index: number; text: string }
  | { kind: 'tools'; index: number; ids: string[] }
  | { kind: 'image'; index: number; image: ImageContent }

/** 相邻工具合并，正文和图片保留原顺序；思考由消息顶部单独呈现。 */
export function messageSegments(content: ContentBlock[]): MessageSegment[] {
  const segments: MessageSegment[] = []
  content.forEach((block, index) => {
    if (block.type === 'text' && block.text.trim())
      segments.push({ kind: 'text', index, text: block.text })
    else if (block.type === 'image') segments.push({ kind: 'image', index, image: block })
    else if (block.type === 'toolCall') {
      const last = segments[segments.length - 1]
      if (last?.kind === 'tools') last.ids.push(block.id)
      else segments.push({ kind: 'tools', index, ids: [block.id] })
    }
  })
  return segments
}
