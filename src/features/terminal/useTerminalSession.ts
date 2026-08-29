import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import {
  onTerminalExit,
  onTerminalOutput,
  openTerminal,
  resizeTerminal,
  writeTerminal,
} from '@/shared/api/terminal'

/** base64 → 字节。xterm 接受 Uint8Array，且能自行拼接被切断的多字节字符 */
function decode(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** 取当前主题的前景/背景，终端才不会在浅色下是一块黑 */
function themeColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    background: style.getPropertyValue('--bg-canvas').trim() || '#ffffff',
    foreground: style.getPropertyValue('--text-primary').trim() || '#1d1d1d',
    cursor: style.getPropertyValue('--text-primary').trim() || '#1d1d1d',
  }
}

/**
 * 把一个 PTY 会话接到一个 DOM 容器上。
 *
 * 生命周期与标签 id 绑定：id 不变就不重建，避免切换标签时把滚动缓冲清空。
 */
export function useTerminalSession(id: string, cwd: string | null, onExit: (id: string) => void) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim(),
      fontSize: 12,
      theme: themeColors(),
      cursorBlink: true,
      // 滚回去看之前的输出，容量给足但不至于吃内存
      scrollback: 5000,
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    let disposed = false
    const unlisteners: Array<() => void> = []

    void openTerminal(id, cwd, term.cols, term.rows).then(() => {
      if (!disposed) term.focus()
    })

    term.onData((data) => void writeTerminal(id, data))

    void onTerminalOutput((payload) => {
      if (payload.id === id) term.write(decode(payload.data))
    }).then((un) => (disposed ? un() : unlisteners.push(un)))

    void onTerminalExit((exited) => {
      if (exited === id) onExit(id)
    }).then((un) => (disposed ? un() : unlisteners.push(un)))

    /*
     * 容器尺寸变化时重新计算行列并同步给 PTY，否则换行会错位。
     * 面板收起时容器高度为 0，此时不能去 fit——那会把 PTY 设成 0 行 0 列，
     * 再展开时 shell 的排版就乱了。
     */
    const observer = new ResizeObserver(() => {
      if (host.clientWidth === 0 || host.clientHeight === 0) return
      fit.fit()
      void resizeTerminal(id, term.cols, term.rows)
    })
    observer.observe(host)

    /*
     * 只拆前端，不动后端的 PTY。
     *
     * PTY 的存活期跟着「标签」，不是跟着这个组件实例：StrictMode 下 effect 会
     * 挂载→卸载→再挂载，若在这里 kill，被杀的 PTY 随即发出 exit 事件，
     * 第二次挂载的监听器收到后就把标签关了——表现为「一展开就自己折叠」。
     * 关闭 PTY 统一由关标签的地方负责。
     */
    return () => {
      disposed = true
      observer.disconnect()
      unlisteners.forEach((un) => un())
      term.dispose()
    }
    // onExit 是 store action，引用稳定，不会因它重建终端
  }, [id, cwd, onExit])

  return hostRef
}
