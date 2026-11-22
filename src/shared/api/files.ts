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

/**
 * 读取任意本地文件内容，供正文文件链接的「复制文件内容」用。
 *
 * 与 previewWorkspaceFile 的区别：那个只允许项目内的相对路径（防越权），
 * 这个要能读正文里出现的绝对路径——链接是模型给出的，用户点「复制内容」
 * 就是明确要看那个文件。后端仍限 512 KB 且只接受 UTF-8 文本。
 */
export function readAnyFile(path: string): Promise<string> {
  return invoke('read_any_file', { path })
}
