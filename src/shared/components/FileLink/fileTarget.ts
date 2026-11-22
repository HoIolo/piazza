/**
 * 正文里文件链接的路径归一化。
 *
 * 模型给的 href 有三种写法：
 *   /Users/x/a.ts        绝对路径
 *   ~/a.ts               家目录
 *   src/a.ts:12          相对项目根 + 行号
 * 后面的 `:行[:列]` 不是路径的一部分，要去掉才能 stat / 复制。
 */
export interface FileTarget {
  /** 用于 stat、打开、复制的路径；相对路径已按 cwd 补全 */
  path: string
  /** 显示给用户看的原始路径（含行号），相对路径保持原样 */
  display: string
  /** 行号，从 1 开始；没有则为 null */
  line: number | null
}

const LINE_SUFFIX = /:(\d+)(?::(\d+))?$/

/** 把 href 解析成路径 + 行号。cwd 为 null 时相对路径原样返回 */
export function parseFileTarget(href: string, cwd: string | null): FileTarget {
  const raw = href.startsWith('file://') ? safeDecode(href.replace(/^file:\/\//i, '')) : href
  const match = LINE_SUFFIX.exec(raw)
  const withoutLine = match ? raw.slice(0, match.index) : raw
  const line = match ? Number(match[1]) : null
  return { path: resolve(withoutLine, cwd), display: raw, line }
}

function resolve(path: string, cwd: string | null): string {
  if (path.startsWith('/') || path.startsWith('~') || !cwd) return path
  return `${cwd.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * 是不是一个该按「文件」对待的链接。
 *
 * 判据与 Codex 一致：不是 http(s) 之类的协议，且带扩展名或是绝对路径。
 * 光看扩展名会把 `/Applications/Piazza.app` 漏掉（`.app` 是目录），
 * 所以绝对路径一律算。纯锚点（`#section`）不算。
 */
export function isFileHref(href: string | undefined): boolean {
  if (!href) return false
  if (href.startsWith('#')) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('file://')) return false
  const clean = href.replace(LINE_SUFFIX, '')
  if (clean.startsWith('/') || clean.startsWith('~/') || clean.startsWith('./')) return true
  return /[^\s/]+\.[a-z0-9]{1,12}$/i.test(clean)
}

/**
 * 相对项目根的路径，不在项目内则为 null。
 *
 * 应用内预览（右侧「文件」标签）只能读项目内的文件——后端 `workspace_path`
 * 明确拒绝绝对路径与 `..`。所以项目外的文件不能走内嵌预览，只能交给系统应用。
 */
export function projectRelative(target: FileTarget, cwd: string | null): string | null {
  if (!cwd) return target.path.startsWith('/') || target.path.startsWith('~') ? null : target.path
  const root = cwd.replace(/\/$/, '')
  if (target.path === root) return ''
  if (!target.path.startsWith(`${root}/`)) return null
  return target.path.slice(root.length + 1)
}
