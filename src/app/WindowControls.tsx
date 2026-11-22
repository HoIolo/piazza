import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'
import styles from './WindowControls.module.css'

/**
 * Windows 下的最小化 / 最大化 / 关闭。
 *
 * 窗口是 `decorations: false`（见 tauri.windows.conf.json），系统标题栏整个让给了
 * 网页，这三个键得自己画。macOS 不用它——那边是左上角的系统红绿灯，
 * 由 trafficLightPosition 摆位置。
 *
 * 这里刻意不在渲染期取窗口对象：浏览器里（给样式调试用的 vite preview）
 * 没有 `__TAURI_INTERNALS__`，取窗口会抛错把整棵树卸掉，表现成整页空白。
 */
function inTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!inTauri()) return
    let disposed = false
    const appWindow = getCurrentWindow()
    const sync = () => {
      void appWindow.isMaximized().then((value) => {
        if (!disposed) setMaximized(value)
      })
    }
    sync()
    const unlisten = appWindow.onResized(sync)
    return () => {
      disposed = true
      void unlisten.then((off) => off())
    }
  }, [])

  const act = (run: (appWindow: ReturnType<typeof getCurrentWindow>) => Promise<void>) => {
    if (!inTauri()) return
    void run(getCurrentWindow())
  }

  return (
    <div className={styles.host}>
      <button
        type="button"
        className={styles.button}
        aria-label="最小化"
        title="最小化"
        onClick={() => act((w) => w.minimize())}
      >
        <Minus size={15} strokeWidth={1.4} />
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label={maximized ? '向下还原' : '最大化'}
        title={maximized ? '向下还原' : '最大化'}
        onClick={() => act((w) => w.toggleMaximize())}
      >
        <Square size={maximized ? 11 : 12} strokeWidth={1.4} />
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.close}`}
        aria-label="关闭"
        title="关闭"
        onClick={() => act((w) => w.close())}
      >
        <X size={16} strokeWidth={1.4} />
      </button>
    </div>
  )
}
