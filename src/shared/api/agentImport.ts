import { invoke } from '@tauri-apps/api/core'

/** 首次启动是否要从 pi CLI 的 `~/.pi/agent` 搬配置过来 */
export interface ImportOffer {
  source: string
  target: string
  /** 可导入的条目名（文件与目录） */
  items: string[]
  sessionCount: number
}

/** 读「要不要问」。返回 null 表示不用问：问过了、目标已在用、或来源不存在 */
export function readImportOffer(): Promise<ImportOffer | null> {
  return invoke<ImportOffer | null>('pi_import_offer')
}

/** 执行导入，返回真正复制过去的条目名 */
export function runImport(includeSessions: boolean): Promise<string[]> {
  return invoke<string[]>('pi_import', { options: { includeSessions } })
}

/** 用户选择不导入：留标记，之后不再询问 */
export function skipImport(): Promise<void> {
  return invoke<void>('pi_import_skip')
}
