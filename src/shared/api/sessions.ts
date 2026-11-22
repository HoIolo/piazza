import { invoke } from '@tauri-apps/api/core'
import type { AgentMessage } from '@/rpc/types'

/** 与 src-tauri/src/sessions.rs 的 SessionMeta 对应 */
export interface SessionMeta {
  id: string
  path: string
  title: string
  timestamp: string
  /** 文件最后修改时间：只反映最后活动，会被新一轮对话不断推新 */
  modifiedMs: number
  /** 会话创建时间，取自会话头，永不改变。侧栏按它排「添加先后」 */
  createdMs: number
}

/** 与 src-tauri/src/sessions.rs 的 ProjectGroup 对应 */
export interface ProjectGroup {
  cwd: string
  name: string
  sessions: SessionMeta[]
  latestMs: number
}

export interface SessionSnapshot {
  sessionName: string | null
  messages: AgentMessage[]
}

/** 扫描 <agent>/sessions（应用自有目录），按真实工作目录分组 */
export function scanSessions(): Promise<ProjectGroup[]> {
  return invoke<ProjectGroup[]>('scan_sessions')
}

/** 把一条会话记录移进系统废纸篓。后端会校验路径确实是会话目录下的文件 */
export function trashSession(path: string): Promise<void> {
  return invoke('trash_session', { path })
}

/** 原地截断会话文件至目标用户消息之前，供编辑重发复用同一会话 */
export function truncateSessionBefore(path: string, entryId: string): Promise<void> {
  return invoke('truncate_session_before', { path, entryId })
}

/** 从磁盘直接读取会话当前活跃分支的消息快照，避免切换时苦等 pi 冷启 */
export function readSessionSnapshot(path: string): Promise<SessionSnapshot> {
  return invoke<SessionSnapshot>('read_session_snapshot', { path })
}
