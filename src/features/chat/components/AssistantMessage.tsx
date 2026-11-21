import { memo, useState } from 'react'
import { Check, Copy, GitBranch } from 'lucide-react'
import type { ChatAssistantMessage, ToolExecution } from '@/store/chat'
import { formatTimestamp } from '@/shared/utils/format'
import { ErrorBlock } from './blocks/ErrorBlock'
import { ThinkingBlock } from './blocks/ThinkingBlock'
import { MessageSegment } from './MessageSegment'
import { messageSegments, type MessageSegment as Segment } from './messageSegments'
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

function joinThinking(blocks: ChatAssistantMessage['content']): string {
  return blocks
    .filter((block) => block.type === 'thinking')
    .map((block) => block.thinking)
    .join('\n\n')
}

function trailingThinkingOf(message: ChatAssistantMessage): string {
  let lastToolIdx = -1
  for (let i = message.content.length - 1; i >= 0; i -= 1) {
    if (message.content[i]?.type === 'toolCall') {
      lastToolIdx = i
      break
    }
  }
  return joinThinking(lastToolIdx === -1 ? message.content : message.content.slice(lastToolIdx + 1))
}

/**
 * 思考区当前状态。
 *
 * active 以计时是否还在走为准，而不是「最后一块是不是 thinking」：
 * 两者判断的其实是同一件事，但让文案和秒数同源，才不会出现
 * 秒数已经停住、这行还亮着扫光的情况。
 *
 * 若末尾紧跟着工具调用组，把进行中的思考折叠进该工具组；否则仍渲染在消息顶部。
 */
function thinkingStateOf(
  message: ChatAssistantMessage,
  lastSegment: Segment | undefined,
  tools: Record<string, ToolExecution>,
  streaming: boolean,
) {
  const active = streaming && message.thinking?.startedAt != null
  if (!active)
    return { active: false, standalone: null as string | null, folded: null as string | null }
  const canFold = lastSegment?.kind === 'tools' && lastSegment.ids.some((id) => Boolean(tools[id]))
  if (canFold) return { active: true, standalone: null, folded: trailingThinkingOf(message) }
  const content = joinThinking(message.content)
  return { active: true, standalone: content.length > 0 ? content : null, folded: null }
}

/** 助手消息。思考内容合并到顶部折叠行（或在紧跟工具组时折叠进该组），正文与工具调用按 content 原顺序渲染 */
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

  const segments = messageSegments(message.content)
  const lastSegment = segments[segments.length - 1]
  const think = thinkingStateOf(message, lastSegment, tools, streaming)

  const copy = () => {
    void navigator.clipboard.writeText(plainText(message)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <article className={styles.message} data-streaming={streaming}>
      {/* 仅在思考进行中展示一行「正在思考」与最新预览，思考完成后移除 */}
      {think.standalone !== null && <ThinkingBlock content={think.standalone} active />}

      {segments.map((segment) => (
        <MessageSegment
          key={segment.index}
          segment={segment}
          tools={tools}
          cwd={cwd}
          caret={streaming && !think.active && segment === lastSegment && segment.kind === 'text'}
          thinking={segment === lastSegment ? think.folded : null}
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
