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

function signatureOf(message: AgentMessage | undefined): string {
  if (!message) return ''
  const raw = 'content' in message ? message.content : undefined
  const size = typeof raw === 'string' ? raw.length : Array.isArray(raw) ? raw.length : 0
  return `${message.role}:${message.timestamp}:${size}`
}

/** 快速判断磁盘/缓存预览与 pi 回传的消息列表是否一致，一致则跳过多余重绘 */
export function messagesEquivalent(a: readonly AgentMessage[], b: readonly AgentMessage[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  if (a.length === 0) return true
  return (
    signatureOf(a[0]) === signatureOf(b[0]) &&
    signatureOf(a[a.length - 1]) === signatureOf(b[b.length - 1])
  )
}
