import { useState } from 'react'
import { Check, Copy, GitBranch } from 'lucide-react'
import type { ToolCallContent } from '@/rpc/types'
import type { ChatAssistantMessage, ToolExecution } from '@/store/chat'
import { formatTimestamp } from '@/shared/utils/format'
import { Markdown } from './Markdown'
import { ErrorBlock } from './blocks/ErrorBlock'
import { ThinkingBlock } from './blocks/ThinkingBlock'
import { ToolCallBlock } from './blocks/ToolCallBlock'
import { FileChangeCard } from './FileChangeCard'
import { collectFileChanges, relativize } from './FileChangeCard/collect'
import styles from './AssistantMessage.module.css'

export interface AssistantMessageProps {
  message: ChatAssistantMessage
  tools: Record<string, ToolExecution>
  cwd: string | null
  streaming?: boolean
  /** 过程轮次不显示操作栏——复制/分支只对整次交互的结论有意义 */
  hideFooter?: boolean
}

/** 取消息的纯文本，供复制使用 */
function plainText(message: ChatAssistantMessage): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')
}

/**
 * 这一轮的失败原因。限流、认证失败这类错误 pi 会连同空 content 一起返回，
 * 不显示的话用户只看到「耗时 0 秒」加一片空白，完全不知道发生过什么。
 */
function failureOf(message: ChatAssistantMessage): string | null {
  if (message.errorMessage) return message.errorMessage
  return message.stopReason === 'error' ? '模型调用失败，pi 未给出原因' : null
}

/**
 * 思考区当前状态。
 *
 * active 以计时是否还在走为准，而不是「最后一块是不是 thinking」：
 * 两者判断的其实是同一件事，但让文案和秒数同源，才不会出现
 * 秒数已经停住、这行还亮着扫光的情况。
 *
 * 仍然带上 streaming 这层保险：万一哪个事件没发导致表没停下来，
 * 消息一落定也会把扫光收掉，不至于永远「正在思考」。
 */
function thinkingStateOf(message: ChatAssistantMessage, streaming: boolean) {
  const content = message.content
    .filter((block) => block.type === 'thinking')
    .map((block) => block.thinking)
    .join('\n\n')

  return {
    content,
    timing: message.thinking ?? null,
    active: streaming && message.thinking?.startedAt != null,
  }
}

/** 助手消息。思考内容合并到顶部折叠行，正文与工具调用按 content 原顺序渲染 */
export function AssistantMessage({
  message,
  tools,
  cwd,
  streaming = false,
  hideFooter = false,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false)

  const changes = collectFileChanges(tools).map((change) => ({
    ...change,
    path: relativize(change.path, cwd),
  }))

  // 光标只跟在最后一个文本块末尾；用下标标记而非 CSS 选兄弟节点，
  // 后者会被 FileChangeCard 等同为 div 的块干扰
  const lastTextIndex = message.content.reduce(
    (last, block, index) => (block.type === 'text' ? index : last),
    -1,
  )

  // 流式中且一个字都还没吐出来，此时该说「正在思考」而不是「处理中」
  const think = thinkingStateOf(message, streaming)

  const copy = () => {
    void navigator.clipboard.writeText(plainText(message)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <article className={styles.message} data-streaming={streaming}>
      {/* 没有思考内容就不出这一行——「在等模型开口」由上面的状态行负责说，两处都说就重复了 */}
      {think.content.length > 0 && (
        <ThinkingBlock content={think.content} active={think.active} timing={think.timing} />
      )}

      {message.content.map((block, index) => {
        if (block.type === 'text') {
          return (
            <Markdown key={index} caret={streaming && index === lastTextIndex} cwd={cwd}>
              {block.text}
            </Markdown>
          )
        }
        if (block.type === 'toolCall') {
          const execution = tools[(block as ToolCallContent).id]
          return execution ? <ToolCallBlock key={index} execution={execution} /> : null
        }
        return null
      })}

      <FileChangeCard changes={changes} />

      <ErrorBlock text={failureOf(message)} />

      {!hideFooter && !streaming && (
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.action}
            onClick={copy}
            aria-label={copied ? '已复制' : '复制'}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button type="button" className={styles.action} aria-label="从此分支">
            <GitBranch size={14} />
          </button>
          <time className={styles.time}>{formatTimestamp(message.timestamp)}</time>
        </footer>
      )}
    </article>
  )
}
