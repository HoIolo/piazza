import type { UserMessage } from '@/rpc/types'

/**
 * 提取用户消息的纯文本。content 可能是字符串，也可能是内容块数组。
 *
 * 放在 shared 是因为两处都要用：气泡渲染要显示它，
 * reducer 合并本地回显时要靠它判断「是不是同一句」。
 */
export function userText(message: UserMessage): string {
  if (typeof message.content === 'string') return message.content
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}
