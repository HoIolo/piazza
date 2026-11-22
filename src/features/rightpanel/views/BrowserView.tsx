import { useRef } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Globe, RotateCw } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { useAppStore } from '@/store/app.store'
import { invoke } from '@tauri-apps/api/core'
import { useBrowserNavigation } from './useBrowserNavigation'
import { useNativeBrowserFrame } from './useNativeBrowserFrame'
import styles from './BrowserView.module.css'

/**
 * 这里的空白区域就是原生子 webview 的显示位。
 *
 * 不用 `<iframe>`：几乎所有的站点都会发 `Content-Security-Policy: frame-ancestors`
 * 或 `X-Frame-Options`，禁止被别的来源嵌入，iframe 里只会是一片白。
 * 改由 `useNativeBrowserFrame` 把这块矩形交给 Rust 侧创建的 WKWebView。
 */
export function BrowserView() {
  const b = useBrowserNavigation()
  const frameRef = useRef<HTMLDivElement>(null)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const paletteOpen = useAppStore((s) => s.paletteOpen)

  // 本地 .html 也要走原生视图：转成 data URL，和原来 srcDoc 的语义一致
  const url =
    b.current === undefined
      ? null
      : b.current.kind === 'url'
        ? b.current.value
        : b.htmlDoc === null
          ? null
          : `data:text/html;charset=utf-8,${encodeURIComponent(b.htmlDoc)}`

  // 整窗浮层（设置、命令面板）会盖住这块区域，原生视图在上面会挡住它们
  const covered = settingsOpen || paletteOpen
  useNativeBrowserFrame(frameRef, url, rightPanelOpen && !covered)

  const reload = () => {
    b.reload()
    void invoke('browser_reload').catch(() => undefined)
  }

  return (
    <div className={styles.browser}>
      <form className={styles.toolbar} onSubmit={b.navigate}>
        <IconButton size="sm" ariaLabel="后退" disabled={!b.canGoBack} onClick={() => b.step(-1)}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton size="sm" ariaLabel="前进" disabled={!b.canGoForward} onClick={() => b.step(1)}>
          <ArrowRight size={14} />
        </IconButton>
        <IconButton size="sm" ariaLabel="重新加载网页" disabled={!b.current} onClick={reload}>
          <RotateCw size={13} />
        </IconButton>
        <input
          type="text"
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="网页地址"
          placeholder="输入网址或 .html 路径"
          value={b.address}
          onChange={(event) => b.setAddress(event.target.value)}
          onFocus={(event) => event.target.select()}
        />
        <IconButton
          size="sm"
          ariaLabel="在系统浏览器中打开"
          disabled={!b.current}
          onClick={b.openExternal}
        >
          <ArrowUpRight size={15} />
        </IconButton>
      </form>
      {b.error && (
        <p className={styles.error} role="alert">
          {b.error}
        </p>
      )}
      {/* 原生视图盖在这块占位之上；有内容时占位保持透明，别露出底色 */}
      <div className={styles.stage} data-live={Boolean(url)}>
        <div ref={frameRef} className={styles.frame} />
        {!url && (
          <div className={styles.empty}>
            <Globe size={22} className={styles.emptyIcon} />
            <h3>网页预览</h3>
            <p>点击对话中的 .html 文件，或输入本地开发地址实时预览。</p>
          </div>
        )}
      </div>
    </div>
  )
}
