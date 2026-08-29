import { invoke } from '@tauri-apps/api/core'

/** 与 src-tauri/src/files.rs 的 FileHit 对应 */
export interface FileHit {
  path: string
  name: string
  dir: string
}

/** 在当前项目内搜索文件，供 @ 提及使用 */
export function searchProjectFiles(cwd: string, query: string): Promise<FileHit[]> {
  return invoke<FileHit[]>('search_project_files', { cwd, query })
}
