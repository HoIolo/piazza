import { useSyncExternalStore } from 'react'
import { rpcClient } from '@/rpc/client'
import type { AgentEvent, SessionState } from '@/rpc/types'
import { userText } from '@/shared/utils/message'
import { useProjectsStore } from '@/store/projects.store'
import { markRpcProcessExited } from './bootSession'
import { sessionMetadataPatch } from './sessionMetadata'
import { reduceEvent } from './reducer'
import { putCachedSession } from './sessionCache'
import { backgroundSnapshot, deriveSessionStatus, type ChatRowStatus, type ChatSnapshot } from './types'

export interface BackgroundSession {
  slotId: string
  cwd: string
  viewKey: string
  sessionFile: string | null
  session: SessionState | null
  snapshot: ChatSnapshot
}

export interface BackgroundSummary {
  slotId: string
  cwd: string
  path: string
  title: string
  startedMs: number
  status: ChatRowStatus
}

const pool = new Map<string, BackgroundSession>()
const listeners = new Set<() => void>()
let cachedSummaries: BackgroundSummary[] = []

function buildSummaries(): BackgroundSummary[] {
  const result: BackgroundSummary[] = []
  for (const bg of pool.values()) {
    const path = bg.sessionFile
    if (!path) continue
    const first = bg.snapshot.messages.find((m) => m.role === 'user')
    result.push({
      slotId: bg.slotId,
      cwd: bg.cwd,
      path,
      title: bg.session?.sessionName ?? (first?.role === 'user' ? userText(first) : ''),
      startedMs: first?.timestamp ?? Date.now(),
      status: deriveSessionStatus(bg.snapshot) ?? 'working',
    })
  }
  return result
}

function notify(): void {
  cachedSummaries = buildSummaries()
  listeners.forEach((cb) => cb())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** 订阅所有仍在后台流式运行的会话摘要，供侧栏展示运行态与未落盘占位行 */
export function useBackgroundSessions(): readonly BackgroundSummary[] {
  return useSyncExternalStore(subscribe, () => cachedSummaries)
}

/** 将正在流式输出的前台会话转入后台继续跑，不中断其 pi 进程 */
export function detachForeground(
  slotId: string,
  cwd: string,
  state: ChatSnapshot & { session: SessionState | null },
): void {
  pool.set(slotId, {
    slotId,
    cwd,
    viewKey: state.viewKey,
    sessionFile: state.session?.sessionFile ?? null,
    session: state.session,
    snapshot: backgroundSnapshot(state),
  })
  notify()
}

/** 切回某条后台运行中的会话时，将其从后台池取出并无缝接回前台 */
export function reattachBackground(
  targetPath: string | null,
  viewKey: string,
): BackgroundSession | null {
  for (const [slotId, bg] of pool) {
    const matched = (targetPath && bg.sessionFile === targetPath) || bg.viewKey === viewKey
    if (!matched) continue
    pool.delete(slotId)
    notify()
    return bg
  }
  return null
}

function settleBackground({ slotId, session, sessionFile, snapshot }: BackgroundSession): void {
  if (sessionFile && snapshot.messages.length > 0) {
    putCachedSession(sessionFile, {
      state: session,
      sessionName: session?.sessionName ?? snapshot.previewName,
      messages: snapshot.messages,
      tools: snapshot.tools,
    })
  }
  pool.delete(slotId)
  notify()
  void useProjectsStore.getState().refresh()
  markRpcProcessExited(slotId)
  void rpcClient.stop(slotId).catch(() => undefined)
}

function settleIfIdle(bg: BackgroundSession): void {
  if (!bg.snapshot.isStreaming && !bg.snapshot.titlePending) settleBackground(bg)
}

/** 处理后台槽位发来的 agent 事件：更新其快照，完成时落缓存并回收进程 */
export function applyBackgroundEvent(slotId: string, event: AgentEvent): void {
  const bg = pool.get(slotId)
  if (!bg) return
  const metadata = sessionMetadataPatch(bg.session, event)
  if (metadata) {
    const { session = bg.session, ...patch } = metadata
    bg.session = session
    Object.assign(bg.snapshot, patch)
    if (event.type === 'session_info_changed') notify()
    settleIfIdle(bg)
    return
  }
  const prevStatus = deriveSessionStatus(bg.snapshot)
  bg.snapshot = reduceEvent(bg.snapshot, event)

  if (event.type === 'message_end' && event.message.role === 'user') {
    void useProjectsStore.getState().refresh()
    notify()
    return
  }
  if (event.type === 'agent_settled') {
    settleIfIdle(bg)
    return
  }
  if (deriveSessionStatus(bg.snapshot) !== prevStatus) {
    notify()
  }
}

export function handleBackgroundExit(slotId: string): void {
  if (pool.delete(slotId)) notify()
}

/** 删除会话时若它正在后台运行，先停掉其后台 pi 进程 */
export function stopBackgroundSession(path: string): void {
  for (const [slotId, bg] of pool) {
    if (bg.sessionFile !== path && bg.viewKey !== path) continue
    pool.delete(slotId)
    notify()
    markRpcProcessExited(slotId)
    void rpcClient.stop(slotId).catch(() => undefined)
  }
}
