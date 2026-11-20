import { openUrl } from '@tauri-apps/plugin-opener'
import { openPathWith } from '@/shared/api/pi'
import { useAppStore } from '@/store/app.store'

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(href) || /^mailto:/i.test(href)
}

function isLocalhostHttp(href: string): boolean {
  try {
    const url = new URL(href)
    if (url.origin === window.location.origin) return false
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname)
    )
  } catch {
    return false
  }
}

function isHtmlPath(path: string): boolean {
  return /\.(?:html?)(?:$|[?#])/i.test(path)
}

function stripFileScheme(href: string): string {
  if (!href.startsWith('file://')) return href
  try {
    return decodeURIComponent(href.replace(/^file:\/\//i, ''))
  } catch {
    return href.replace(/^file:\/\//i, '')
  }
}

function resolveTargetPath(href: string, cwd: string | null): string {
  const clean = stripFileScheme(href).replace(/:\d+(?::\d+)?$/, '')
  if (clean.startsWith('/') || clean.startsWith('~/') || !cwd) return clean
  return `${cwd.replace(/\/$/, '')}/${clean.replace(/^\.\//, '')}`
}

/**
 * 打开正文里的链接：
 * - localhost 网页、本地 .html/.htm 文件 -> 直接在右侧内置浏览器标签页打开；
 * - 其他外部网址 -> 交给系统默认浏览器；
 * - 其他本地文件 -> 交给系统默认应用打开。
 */
export async function openLink(href: string, cwd: string | null): Promise<void> {
  if (href.startsWith('file://')) {
    const resolved = resolveTargetPath(href, cwd)
    if (isHtmlPath(resolved)) {
      useAppStore.getState().openBrowserFile(resolved)
      return
    }
    return openPathWith('', resolved)
  }

  if (isExternal(href)) {
    if (isLocalhostHttp(href)) {
      useAppStore.getState().openBrowserUrl(href)
      return
    }
    return openUrl(href)
  }

  const resolved = resolveTargetPath(href, cwd)
  if (isHtmlPath(resolved)) {
    useAppStore.getState().openBrowserFile(resolved)
    return
  }
  return openPathWith('', resolved)
}
