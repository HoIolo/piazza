import { open } from '@tauri-apps/plugin-dialog'

/**
 * 去掉末尾斜杠，把选择器给的路径对齐成扫描结果里的 cwd。
 *
 * 扫描出的 cwd 一律不带尾斜杠，用户从系统选择器拿到的却常常带一个——
 * 不归一化的话，同一个目录会以两种写法同时出现在侧栏里。
 */
export function normalizeProjectPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * 系统目录选择器，支持多选。
 *
 * 取消时返回空数组，调用方不必再分辨 null 与数组两种返回形状。
 */
export async function pickProjectDirectories(defaultPath?: string): Promise<string[]> {
  const picked = await open({ directory: true, multiple: true, defaultPath })
  if (picked === null) return []
  const list = Array.isArray(picked) ? picked : [picked]
  return [...new Set(list.map(normalizeProjectPath))]
}
