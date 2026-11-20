import type { ThinkingLevel } from '@/rpc/types'

/** 思考等级的中文显示名，与截图中的「最高」「极高」一致 */
const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: '关闭',
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最高',
}

export function thinkingLabel(level: ThinkingLevel | undefined): string {
  return level ? (THINKING_LABELS[level] ?? level) : ''
}

export const THINKING_OPTIONS = Object.entries(THINKING_LABELS).map(([value, label]) => ({
  value,
  label,
}))

/** 将毫秒格式化为短时长，例如 1天2时3分4秒。 */
export function formatDuration(ms: number): string {
  let seconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
  const units = [
    [86400, '天'],
    [3600, '时'],
    [60, '分'],
    [1, '秒'],
  ] as const
  return (
    units
      .map(([size, suffix]) => {
        const value = Math.floor(seconds / size)
        seconds %= size
        return value ? `${value}${suffix}` : ''
      })
      .join('') || '0秒'
  )
}

/** 时间戳格式化为「7月9日 22:53」 */
export function formatTimestamp(ms: number): string {
  const date = new Date(ms)
  const time = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
}

/**
 * 距今多久的短写：「刚刚」「5分钟」「3小时」「2天」「4周」「8个月」「1年」。
 * 给侧栏会话行用，只留一级单位——那里的宽度只够放三四个字。
 */
export function formatRelative(ms: number, now = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - ms) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天`
  if (days < 30) return `${Math.floor(days / 7)}周`
  if (days < 365) return `${Math.floor(days / 30)}个月`
  return `${Math.floor(days / 365)}年`
}

/** token 数的短写：200000 → 200K，1000000 → 1M，262144 → 262K。给上下文窗口这类大数用 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
  }
  return `${Math.round(count / 1000)}K`
}
