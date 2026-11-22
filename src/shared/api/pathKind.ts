import { invoke } from '@tauri-apps/api/core'

/** file / dir / missing */
export type PathKind = 'file' | 'dir' | 'missing'

interface PathKindResult {
  kind: PathKind
}

/**
 * 目标路径是文件、目录还是不存在。
 *
 * 正文里的文件链接要按它分流：目录给「在访达中显示」，文件才给「复制文件内容」。
 * 不能在渲染时同步调用——那会让每条消息都发一次 IPC；调用方按需查并缓存。
 */
export async function readPathKind(path: string): Promise<PathKind> {
  try {
    const result = await invoke<PathKindResult>('path_kind', { path })
    return result.kind
  } catch {
    return 'missing'
  }
}
