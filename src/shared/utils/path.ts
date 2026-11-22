/** 取路径最后一段作为展示名 */
export function basename(path: string): string {
  const normalized = /^(?:[a-z]:|\\\\)/i.test(path) ? path.replaceAll('\\', '/') : path
  const trimmed = normalized.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index === -1 ? trimmed : trimmed.slice(index + 1)
}

/** 项目内的绝对路径转相对路径；项目外或无项目时原样返回 */
export function relativeTo(path: string, base: string | null): string {
  if (!base) return path
  const prefix = base.endsWith('/') ? base : `${base}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}
