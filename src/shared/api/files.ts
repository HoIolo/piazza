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

export interface WorkspaceEntry {
  path: string
  name: string
  directory: boolean
}

export function listWorkspaceDir(cwd: string, path: string): Promise<WorkspaceEntry[]> {
  return invoke('list_workspace_dir', { cwd, path })
}

export function previewWorkspaceFile(cwd: string, path: string): Promise<string> {
  return invoke('preview_workspace_file', { cwd, path })
}

export function readHtmlPreview(path: string): Promise<string> {
  return invoke('read_html_preview', { path })
}
