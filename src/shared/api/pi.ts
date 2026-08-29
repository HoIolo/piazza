import { invoke } from '@tauri-apps/api/core'

/** 与 src-tauri/src/pi_locate.rs 的 PiLauncher 对应 */
export interface PiLauncher {
  program: string
  prefixArgs: string[]
  /** 解析来源，设置页据此展示 pi 是怎么被找到的 */
  source: string
}

/**
 * 解析 pi 可执行文件位置。
 * refresh=true 时忽略缓存重新探测，用于设置页手动改路径后立即生效。
 */
export function locatePi(userOverride?: string, refresh = false): Promise<PiLauncher | null> {
  return invoke<PiLauncher | null>('locate_pi', { userOverride: userOverride ?? null, refresh })
}

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
