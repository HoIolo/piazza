import { invoke } from '@tauri-apps/api/core'

/** 与 src-tauri/src/external.rs 的 ExternalApp 对应 */
export interface ExternalApp {
  name: string
  /** .app 绝对路径；空串表示交给访达 */
  path: string
  /** 应用图标的 PNG data URI；取不到时为 null */
  icon: string | null
}

/** 列出本机已安装、可用于「打开位置」的应用 */
export function listExternalApps(): Promise<ExternalApp[]> {
  return invoke<ExternalApp[]>('list_external_apps')
}

export function openPathWith(appPath: string, target: string): Promise<void> {
  return invoke<void>('open_path_with', { appPath, target })
}
