import { ArrowLeft, ArrowRight, ArrowUpRight, Globe, RotateCw } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { useBrowserNavigation } from './useBrowserNavigation'
import styles from './BrowserView.module.css'

export function BrowserView() {
  const b = useBrowserNavigation()
  const frameKey = b.current ? `${b.current.kind}:${b.current.value}-${b.revision}` : 'empty'

  return (
    <div className={styles.browser}>
      <form className={styles.toolbar} onSubmit={b.navigate}>
        <IconButton size="sm" ariaLabel="后退" disabled={!b.canGoBack} onClick={() => b.step(-1)}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton
          size="sm"
          ariaLabel="前进"
          disabled={!b.canGoForward}
          onClick={() => b.step(1)}
        >
          <ArrowRight size={14} />
        </IconButton>
        <IconButton size="sm" ariaLabel="重新加载网页" disabled={!b.current} onClick={b.reload}>
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
      {b.current ? (
        <iframe
          className={styles.frame}
          key={frameKey}
          title="网页预览"
          src={b.current.kind === 'url' ? b.current.value : undefined}
          srcDoc={b.current.kind === 'html' ? (b.htmlDoc ?? '') : undefined}
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className={styles.empty}>
          <Globe size={22} className={styles.emptyIcon} />
          <h3>网页预览</h3>
          <p>点击对话中的 .html 文件，或输入本地开发地址实时预览。</p>
        </div>
      )}
    </div>
  )
}
