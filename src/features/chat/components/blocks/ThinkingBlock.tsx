import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import { useElapsed } from '@/shared/hooks/useElapsed'
import { formatDuration } from '@/shared/utils/format'
import type { ThinkingTiming } from '@/store/chat'
import styles from './ThinkingBlock.module.css'

export interface ThinkingBlockProps {
  content: string
  /** 思考正在产出：标题带扫光，并跟一行最新内容 */
  active?: boolean
  /** 思考计时。历史会话没有这个信息，此时只给文案不给秒数 */
  timing?: ThinkingTiming | null
}

/** 进行中「正在思考 12秒」，结束后「已思考 12秒」，对应 Codex 的 “Thought for 12s” */
function statusLabel(active: boolean, elapsedMs: number | null): string {
  const head = active ? '正在思考' : '已思考'
  // 不满一秒就先不给数字：「正在思考 0秒」读着比没有数字更莫名其妙
  return elapsedMs ? `${head} ${formatDuration(elapsedMs)}` : head
}

/** 预览保留的尾部字数。超出后从前面截掉，保证看到的是刚吐出来的字 */
const PREVIEW_TAIL = 90

/**
 * 取最新的一行做预览。
 *
 * 从后往前找第一行非空：思考正文里空行分段很常见，直接取末行多半是空串，
 * 预览就会一闪一闪地忽有忽无。
 *
 * 过长时保留尾部而非开头：一段思考可能几百字都不换行，若显示开头，
 * 这行在整段吐完前一动不动，就失去了「它还在想」的意义。
 */
function latestLine(content: string): string {
  const lines = content.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim()
    if (!line) continue
    return line.length > PREVIEW_TAIL ? `…${line.slice(-PREVIEW_TAIL)}` : line
  }
  return ''
}

/**
 * 当前该显示的思考时长。表还在走就实时递增，停了就用最终时长。
 *
 * durationMs 是已累计的部分：一条消息里可能思考—调工具—再思考，
 * 这里给出的是合计，与上面合并展示的思考正文对得上。
 */
function useThinkingElapsed(timing: ThinkingTiming | null | undefined): number | null {
  const live = useElapsed(timing?.startedAt ?? null)
  if (live === null) return timing?.durationMs ?? null
  return (timing?.durationMs ?? 0) + live
}

/**
 * 思考过程。
 *
 * 进行中跟一行最新内容——思考往往要跑几十秒，只有一行「正在思考」的话
 * 分不清是在想还是卡死了；结束后这行收起，标题恢复成可展开的单行，
 * 完整思维链留给想看的人点开。这也是 Codex 的做法。
 */
export function ThinkingBlock({ content, active = false, timing }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const elapsedMs = useThinkingElapsed(timing)

  const canExpand = Boolean(content)
  // 展开后完整内容已经在下面了，预览再留着就是重复的一行
  const preview = active && !expanded ? latestLine(content) : ''

  return (
    <div className={styles.block}>
      <button
        type="button"
        className={styles.line}
        onClick={() => canExpand && setExpanded((v) => !v)}
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
      >
        <ShimmerText active={active}>{statusLabel(active, elapsedMs)}</ShimmerText>
        {canExpand && (
          <ChevronRight size={13} className={styles.chevron} data-expanded={expanded} />
        )}
      </button>

      {preview && <div className={styles.preview}>{preview}</div>}

      {/* grid-template-rows 由 0fr 过渡到 1fr，可在内容高度未知时做展开动画 */}
      <div className={styles.contentWrap} data-expanded={expanded && canExpand}>
        <div className={styles.contentClip}>
          <div className={`${styles.content} selectable`}>{content}</div>
        </div>
      </div>
    </div>
  )
}
