import type { AgentMessage, SessionState } from '@/rpc/types'
import type { ChatMessage, ToolExecution } from './types'

export interface CachedSession {
  state: SessionState | null
  sessionName: string | null
  messages: ChatMessage[]
  tools: Record<string, ToolExecution>
}

export interface SavedScroll {
  scrollTop: number
  atBottom: boolean
}

/** 最多缓存在内存里的历史会话数（对齐 Codex 的 threadStore 内存缓存） */
const MAX_CACHED_SESSIONS = 30
const MAX_SAVED_SCROLLS = 60

const sessions = new Map<string, CachedSession>()
const scrolls = new Map<string, SavedScroll>()

export function getCachedSession(path: string | null): CachedSession | null {
  if (!path) return null
  const hit = sessions.get(path)
  if (!hit) return null
  // LRU 续命
  sessions.delete(path)
  sessions.set(path, hit)
  return hit
}

export function putCachedSession(path: string, entry: CachedSession): void {
  if (!path || entry.messages.length === 0) return
  if (sessions.has(path)) sessions.delete(path)
  sessions.set(path, entry)
  while (sessions.size > MAX_CACHED_SESSIONS) {
    const oldest = sessions.keys().next().value
    if (oldest) sessions.delete(oldest)
  }
}

export function evictCachedSession(path: string): void {
  sessions.delete(path)
  scrolls.delete(path)
}

export function saveSessionScroll(path: string | null, scrollTop: number, atBottom: boolean): void {
  if (!path) return
  if (scrolls.has(path)) scrolls.delete(path)
  scrolls.set(path, { scrollTop, atBottom })
  while (scrolls.size > MAX_SAVED_SCROLLS) {
    const oldest = scrolls.keys().next().value
    if (oldest) scrolls.delete(oldest)
  }
}

export function getSessionScroll(path: string | null): SavedScroll | null {
  return path ? (scrolls.get(path) ?? null) : null
}

function contentSize(raw: unknown): number {
  if (typeof raw === 'string') return raw.length
  if (!Array.isArray(raw)) return 0
  let total = raw.length
  for (const item of raw) {
    if (item && typeof item === 'object') {
      if ('text' in item && typeof item.text === 'string') total += item.text.length
      if ('thinking' in item && typeof item.thinking === 'string') total += item.thinking.length
    }
  }
  return total
}

function signatureOf(message: AgentMessage | undefined): string {
  if (!message) return ''
  const raw = 'content' in message ? message.content : undefined
  const local = 'local' in message && message.local ? 'L' : ''
  const stop = 'stopReason' in message ? String(message.stopReason ?? '') : ''
  return `${message.role}:${local}:${stop}:${message.timestamp}:${contentSize(raw)}`
}

/** 快速判断磁盘/缓存预览与 pi 回传的消息列表是否一致，一致则跳过多余重绘 */
export function messagesEquivalent(
  a: readonly AgentMessage[],
  b: readonly AgentMessage[],
): boolean {
  if (a === b) return true
  const left = a.filter((m) => (m as { role?: string }).role !== 'system')
  const right = b.filter((m) => (m as { role?: string }).role !== 'system')
  if (left.length !== right.length) return false
  if (left.length === 0) return true
  return (
    signatureOf(left[0]) === signatureOf(right[0]) &&
    signatureOf(left[left.length - 1]) === signatureOf(right[right.length - 1])
  )
}
