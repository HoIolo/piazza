import { ChevronRight } from 'lucide-react'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import { formatDuration } from '@/shared/utils/format'
import styles from './StatusLine.module.css'

export interface StatusLineProps {
  /** 本轮仍在进行 */
  active: boolean
  /** 正在压缩上下文 */
  compacting?: boolean
  durationMs: number | null
  /** 模型是否已经开口。没开口时显示等待回复 */
  responded: boolean
  expandable: boolean
  expanded: boolean
  onToggle: () => void
}

/**
 * 一轮交互的状态文案。
 *
 * 模型吐出第一个字之前显示「等待回复」——这段时间是在等 API 回话，
 * 说「处理中」等于把干等谎报成进展。等它真开口了才转「处理中」。
 *
 * 但计时一路从发问那一刻算起，不在转换时重置：用户关心的是「我等了多久」，
 * 而不是「模型开口后又过了多久」。这也是 Codex 的做法。
 */
function statusLabel(
  active: boolean,
  compacting: boolean,
  durationMs: number | null,
  responded: boolean,
): string {
  if (compacting)
    return durationMs ? `正在压缩上下文 ${formatDuration(durationMs)}` : '正在压缩上下文'
  if (!active) return durationMs !== null ? `耗时 ${formatDuration(durationMs)}` : '已完成'
  if (!responded) return '等待回复'
  return durationMs ? `处理中 ${formatDuration(durationMs)}` : '处理中'
}

/** 轮次顶部状态行，结束后可点开看中间过程 */
export function StatusLine({
  active,
  compacting = false,
  durationMs,
  responded,
  expandable,
  expanded,
  onToggle,
}: StatusLineProps) {
  const busy = active || compacting
  return (
    <div className={styles.statusRow} data-waiting={busy && !responded}>
      <button
        type="button"
        className={styles.status}
        onClick={() => expandable && onToggle()}
        disabled={!expandable}
        aria-expanded={expandable ? expanded : undefined}
      >
        <ShimmerText active={busy}>
          {statusLabel(active, compacting, durationMs, responded)}
        </ShimmerText>
        {expandable && (
          <ChevronRight size={13} className={styles.chevron} data-expanded={expanded} />
        )}
      </button>
    </div>
  )
}
