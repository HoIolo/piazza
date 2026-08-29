import { openUrl } from '@tauri-apps/plugin-opener'
import { openPathWith } from '@/shared/api/pi'

/**
 * 带 scheme:// 的算外部地址。
 *
 * 不能简单认「冒号前是 scheme」：模型经常写 `src/foo.ts:42` 这种带行号的引用，
 * 那样会被当成 scheme 为 `foo.ts` 的地址。mailto 没有斜杠，单独认一下。
 */
function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(href) || /^mailto:/i.test(href)
}

/**
 * 打开正文里的链接，绝不让 webview 自己导航过去。
 *
 * 整个应用就是一个 webview：<a> 按默认行为走等于把界面整个换成目标页面——
 * 用户看到的是应用突然「没了」，而且连个后退按钮都没有，只能重启。
 * 相对路径同样致命，它会把人带到 http://localhost:1420/<路径>。
 *
 * 外部地址交给系统浏览器；文件路径交给系统默认应用，相对路径按当前项目补全。
 */
export async function openLink(href: string, cwd: string | null): Promise<void> {
  if (isExternal(href)) return openUrl(href)

  // 行号后缀（foo.ts:42）是给人看的，open 不认，去掉再交出去
  const path = href.replace(/:\d+(?::\d+)?$/, '')
  return openPathWith('', path.startsWith('/') || !cwd ? path : `${cwd}/${path}`)
}
