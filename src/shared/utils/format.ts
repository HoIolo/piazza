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

/**
 * 毫秒时长格式化为「17秒」「1分钟 12秒」「2小时 5分钟」「3天 4小时」。
 *
 * 只保留两级单位：再往下的零头对「跑了多久」这个判断没有帮助，
 * 反而让数字变长、难以一眼读出量级。
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total}秒`

  const minutes = Math.floor(total / 60)
  if (minutes < 60) {
    const seconds = total % 60
    return seconds > 0 ? `${minutes}分钟 ${seconds}秒` : `${minutes}分钟`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const restMinutes = minutes % 60
    return restMinutes > 0 ? `${hours}小时 ${restMinutes}分钟` : `${hours}小时`
  }

  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `${days}天 ${restHours}小时` : `${days}天`
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
