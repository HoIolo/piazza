import { invoke } from '@tauri-apps/api/core'
import type { AgentMessage } from '@/rpc/types'

/** 与 src-tauri/src/sessions.rs 的 SessionMeta 对应 */
export interface SessionMeta {
  id: string
  path: string
  title: string
  timestamp: string
  modifiedMs: number
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

/** 扫描 ~/.pi/agent/sessions，按真实工作目录分组 */
export function scanSessions(): Promise<ProjectGroup[]> {
  return invoke<ProjectGroup[]>('scan_sessions')
}

/** 把一条会话记录移进系统废纸篓。后端会校验路径确实是会话目录下的文件 */
export function trashSession(path: string): Promise<void> {
  return invoke('trash_session', { path })
}

/** 从磁盘直接读取会话当前活跃分支的消息快照，避免切换时苦等 pi 冷启 */
export function readSessionSnapshot(path: string): Promise<SessionSnapshot> {
  return invoke<SessionSnapshot>('read_session_snapshot', { path })
}
