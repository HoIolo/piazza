import { memo, useState } from 'react'
import { Check, Copy, GitBranch } from 'lucide-react'
import type { ChatAssistantMessage, ToolExecution } from '@/store/chat'
import { formatTimestamp } from '@/shared/utils/format'
import { ErrorBlock } from './blocks/ErrorBlock'
import { ThinkingBlock } from './blocks/ThinkingBlock'
import { MessageSegment } from './MessageSegment'
import { messageSegments } from './messageSegments'
import { FileChangeCard, type FileChange } from './FileChangeCard'
import styles from './AssistantMessage.module.css'

export interface AssistantMessageProps {
  message: ChatAssistantMessage
  tools: Record<string, ToolExecution>
  cwd: string | null
  streaming?: boolean
  /** 本次交互的文件改动。只有结论那条消息带，过程轮次不挂卡片 */
  changes?: FileChange[]
  /** 过程轮次不显示操作栏——复制/分支只对整次交互的结论有意义 */
  hideFooter?: boolean
  /** 从本轮回复末尾分叉出新会话 */
  onFork?: () => void
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
  if (message.stopReason === 'aborted') return null
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
    active: streaming && message.thinking?.startedAt != null,
  }
}

/** 助手消息。思考内容合并到顶部折叠行，正文与工具调用按 content 原顺序渲染 */
export const AssistantMessage = memo(function AssistantMessage({
  message,
  tools,
  cwd,
  streaming = false,
  changes = [],
  hideFooter = false,
  onFork,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false)

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
      {/* 仅在思考进行中展示一行「正在思考」与最新预览，思考完成后移除 */}
      {think.active && think.content.length > 0 && (
        <ThinkingBlock content={think.content} active={think.active} />
      )}

      {messageSegments(message.content).map((segment) => (
        <MessageSegment
          key={segment.index}
          segment={segment}
          tools={tools}
          cwd={cwd}
          caret={streaming && segment.index === lastTextIndex}
        />
      ))}

      <FileChangeCard changes={changes} cwd={cwd} />

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
          <button
            type="button"
            className={styles.action}
            onClick={onFork}
            disabled={!onFork}
            aria-label="从此分支"
            title="从此分支"
          >
            <GitBranch size={14} />
          </button>
          <time className={styles.time}>{formatTimestamp(message.timestamp)}</time>
        </footer>
      )}
    </article>
  )
})
