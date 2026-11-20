export type ResolvedTarget = { kind: 'url'; value: string } | { kind: 'html'; value: string }

function isLocalHtml(input: string): boolean {
  const clean = input.replace(/^file:\/\//i, '').replace(/:\d+(?::\d+)?$/, '')
  return (
    (clean.startsWith('/') || clean.startsWith('~/') || input.startsWith('file://')) &&
    /\.(?:html?)(?:$|[?#])/i.test(clean)
  )
}

export function resolveBrowserInput(address: string): ResolvedTarget {
  const input = address.trim()
  if (isLocalHtml(input)) {
    const clean = input.startsWith('file://')
      ? decodeURIComponent(input.replace(/^file:\/\//i, ''))
      : input
    return { kind: 'html', value: clean.replace(/:\d+(?::\d+)?$/, '') }
  }

  const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/?#]|$)/i.test(input)
  const scheme = /^[a-z][a-z\d+.-]*:/i.test(input)
  const url = new URL(local ? `http://${input}` : scheme ? input : `https://${input}`)

  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('请输入 HTTP/HTTPS 网址或本地 .html 文件路径')
  }
  if (url.origin === window.location.origin) {
    throw new Error('该地址是 Piazza 自身，请输入其他网页地址')
  }
  return { kind: 'url', value: url.href }
}
