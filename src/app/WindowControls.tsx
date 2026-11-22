import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'
import styles from './WindowControls.module.css'

/**
 * Windows 下的最小化 / 最大化 / 关闭。
 *
 * 窗口是 `decorations: false`（见 tauri.macos.conf.json 的对应文件），系统标题栏
 * 整个让给了网页，这三个键得自己画。macOS 不用它——那边是系统红绿灯，
 * 由 trafficLightPosition 摆位置。
 */
function Controls() {
  const appWindow = getCurrentWindow()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let disposed = false
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
  }, [appWindow])

  return (
    <div className={styles.host}>
      <button
        type="button"
        className={styles.button}
        aria-label="最小化"
        title="最小化"
        onClick={() => void appWindow.minimize()}
      >
        <Minus size={15} strokeWidth={1.4} />
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label={maximized ? '向下还原' : '最大化'}
        title={maximized ? '向下还原' : '最大化'}
        onClick={() => void appWindow.toggleMaximize()}
      >
        <Square size={maximized ? 11 : 12} strokeWidth={1.4} />
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.close}`}
        aria-label="关闭"
        title="关闭"
        onClick={() => void appWindow.close()}
      >
        <X size={16} strokeWidth={1.4} />
      </button>
    </div>
  )
}

/**
 * 只在 Tauri 里挂载。浏览器（给样式调试用的 vite preview）里没有
 * `__TAURI_INTERNALS__`，取窗口对象会抛错——那一下会把整棵 React 树卸掉，
 * 表现成整页空白，比少三个按钮严重得多。
 */
export function WindowControls() {
  if (!('__TAURI_INTERNALS__' in window)) return null
  return <Controls />
}
