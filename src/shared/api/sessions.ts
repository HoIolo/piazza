import { invoke } from '@tauri-apps/api/core'

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

/** 扫描 ~/.pi/agent/sessions，按真实工作目录分组 */
export function scanSessions(): Promise<ProjectGroup[]> {
  return invoke<ProjectGroup[]>('scan_sessions')
}
