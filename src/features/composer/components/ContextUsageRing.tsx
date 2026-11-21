import { useEffect, useState } from 'react'
import { rpcClient } from '@/rpc/client'
import type { AssistantMessage, SessionStats } from '@/rpc/types'
import { useAppStore } from '@/store/app.store'
import { useChatStore } from '@/store/chat'
import { modelContextKey } from '@/store/chat/contextWindow'
import styles from './ContextUsageRing.module.css'

const RADIUS = 6.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function formatCompactTokens(tokens: number): string {
  if (tokens <= 0) return '0'
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`
  }
  if (tokens >= 10_000) return `${Math.round(tokens / 1000)}k`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(tokens)
}

function usageTokens(usage: AssistantMessage['usage']): number {
  if (!usage) return 0
  const sum =
    (usage.input || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0) + (usage.output || 0)
  return sum > 0 ? sum : (usage.totalTokens ?? 0)
}

function latestMessageTokens(
  messages: ReturnType<typeof useChatStore.getState>['messages'],
): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue
    const tokens = usageTokens((msg as AssistantMessage).usage)
    if (tokens > 0) return tokens
  }
  return 0
}

function ringTone(percent: number): 'normal' | 'warn' | 'danger' {
  if (percent >= 95) return 'danger'
  return percent >= 80 ? 'warn' : 'normal'
}

function useContextUsageStats(savedWindow: number | undefined) {
  const rpcReady = useChatStore((s) => s.rpcReady)
  const sessionId = useChatStore((s) => s.session?.sessionId)
  const messageCount = useChatStore((s) => s.messages.length)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const isCompacting = useChatStore((s) => s.isCompacting)
  const compactionCount = useChatStore((s) => s.compactionCount)
  const key = `${sessionId ?? ''}:${messageCount}:${isStreaming ? 1 : 0}:${isCompacting ? 1 : 0}:${compactionCount}:${savedWindow ?? 0}`
  const [loaded, setLoaded] = useState<{ key: string; stats?: SessionStats['contextUsage'] }>()

  useEffect(() => {
    if (!rpcReady || !sessionId || isStreaming || isCompacting) return
    let active = true
    void rpcClient
      .send<SessionStats>({ type: 'get_session_stats' })
      .then((res) => {
        if (active) setLoaded({ key, stats: res?.contextUsage })
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [rpcReady, sessionId, isStreaming, isCompacting, key])

  return loaded?.key === key ? loaded.stats : undefined
}

/** 模型选择器左侧的上下文环形用量指示器，悬停展示已用比例与 token 详情（对齐 Codex） */
export function ContextUsageRing() {
  const model = useChatStore((s) => s.session?.model ?? s.lastModel)
  const messages = useChatStore((s) => s.messages)
  const compactedTokens = useChatStore((s) => s.compactedTokens)
  const modelContextWindows = useAppStore((s) => s.modelContextWindows)
  const savedWindow = model
    ? modelContextWindows[modelContextKey(model.provider, model.id)]
    : undefined
  const stats = useContextUsageStats(savedWindow)

  if (!model) return null

  const total = savedWindow ?? stats?.contextWindow ?? model.contextWindow
  if (total <= 0) return null

  const used = stats?.tokens ?? compactedTokens ?? latestMessageTokens(messages)
  const ratio = Math.max(0, Math.min(1, used / total))
  const percent = Math.min(100, Math.round(ratio * 100))
  const offset = CIRCUMFERENCE * (1 - ratio)
  const tone = ringTone(percent)
  const summary = `上下文窗口：${percent}% 已用，已用 ${formatCompactTokens(used)} 标记，共 ${formatCompactTokens(total)}`

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.trigger} aria-label={summary}>
        <svg className={styles.ring} viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
          <circle className={styles.track} cx="9" cy="9" r={RADIUS} />
          <circle
            className={styles.fill}
            data-tone={tone}
            cx="9"
            cy="9"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
      </button>
      <div className={styles.tooltip} role="tooltip">
        <div className={styles.tipMuted}>上下文窗口：</div>
        <div className={styles.tipPercent}>{percent}% 已用</div>
        <div className={styles.tipDetail}>
          已用 {formatCompactTokens(used)} 标记，共 {formatCompactTokens(total)}
        </div>
      </div>
    </div>
  )
}
