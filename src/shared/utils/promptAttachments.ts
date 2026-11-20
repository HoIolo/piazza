export interface PromptAttachment {
  name: string
  content: string
  path?: string
}

/** 还原输入区生成的附件段；RPC 历史仍是普通文本，不依赖额外的会话文件格式。 */
export function splitPromptAttachments(prompt: string) {
  const attachments: PromptAttachment[] = []
  const text = prompt
    .replace(
      /(?:^|\n\n)\[([^\]\n]+)\]\n([\s\S]*?)\n\[\/\1\]/g,
      (_, name: string, content: string) => {
        attachments.push({ name, content })
        return ''
      },
    )
    .replace(/(?:^|\n\n)文件：("[^\n]+")(?=\n\n|$)/g, (original, quoted: string) => {
      try {
        const path: unknown = JSON.parse(quoted)
        if (typeof path !== 'string') return original
        attachments.push({ name: path.split('/').pop() || path, content: path, path })
        return ''
      } catch {
        return original
      }
    })
    .trim()
  return { text, attachments }
}

/** 把编辑后的纯文本重新拼回带附件前缀的 prompt 字符串。 */
export function formatPromptAttachments(text: string, attachments: PromptAttachment[]): string {
  const parts = attachments.map((item) =>
    item.path ? `文件：${JSON.stringify(item.path)}` : `[${item.name}]\n${item.content}\n[/${item.name}]`,
  )
  const trimmed = text.trim()
  if (trimmed) parts.push(trimmed)
  return parts.join('\n\n')
}
