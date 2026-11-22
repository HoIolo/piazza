import { useEffect, useRef, type RefObject } from 'react'
import { invoke } from '@tauri-apps/api/core'

/** 与 src-tauri/src/browser.rs 的 Bounds 对应，单位是逻辑像素（= CSS px） */
interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

function rectOf(el: HTMLElement): Bounds {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

function call(command: string, args?: Record<string, unknown>): void {
  // 在浏览器里跑（探针、非 Tauri 环境）时没有这些命令，静默跳过即可，
  // 不能让它把 React 的渲染链路打断
  void invoke(command, args).catch(() => undefined)
}

/**
 * 把一块 DOM 区域变成原生子 webview 的显示区。
 *
 * 子 webview 是窗口里的原生子视图，不参与 React 布局，也不受 CSS 约束：
 * 位置、尺寸必须由这里按占位元素的矩形主动推过去；切走时要显式隐藏，
 * 否则它会一直盖在 React 画的界面上面。
 *
 * @param enabled 为 false 时隐藏原生视图（切到别的标签、面板收起、整窗浮层打开）
 * @param url     要显示的地址；传 null 表示只保留占位、不建视图
 */
export function useNativeBrowserFrame(
  frameRef: RefObject<HTMLDivElement | null>,
  url: string | null,
  enabled: boolean,
): void {
  // 记住上一次的地址：地址变了才让 Rust 重新导航
  const shownRef = useRef<string | null>(null)

  useEffect(() => {
    const el = frameRef.current
    if (!el || !url || !enabled) {
      if (shownRef.current !== null) {
        shownRef.current = null
        call('browser_hide')
      }
      return
    }

    // enabled 是本 effect 的依赖，闭包里拿到的就是当前值，不需要额外 ref 镜像
    const push = () => {
      const bounds = rectOf(el)
      /*
       * 矩形为 0 说明这个标签被 hidden 掉了（切到别的标签时父级会加 hidden）。
       * 原生视图不参与 CSS，不会跟着消失，必须显式藏起来；
       * 切回来时 ResizeObserver 会再触发一次，那时再显示。
       */
      if (bounds.width < 1 || bounds.height < 1) {
        call('browser_hide')
        return
      }
      call('browser_show', { url, bounds })
    }

    shownRef.current = url
    // 首帧布局未稳，等一帧再量
    const raf = requestAnimationFrame(push)

    /*
     * 面板拖动改宽、窗口缩放、右侧分屏切换都会改变这块区域的大小，
     * 但都不会触发 React 重渲染——只能靠 ResizeObserver 感知。
     */
    const observer = new ResizeObserver(() => push())
    observer.observe(el)
    window.addEventListener('resize', push)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener('resize', push)
    }
  }, [frameRef, url, enabled])

  /*
   * 卸载时只隐藏，不销毁。
   *
   * StrictMode 下 effect 会「挂载 → 清理 → 再挂载」跑两遍，如果这里销毁，
   * 构造和销毁两个异步命令会竞争，可能把刚建好的视图关掉、留下空白面板。
   * 保留那个隐藏的 WKWebView 代价很小，还能让重新打开时保留历史与滚动位置。
   */
  useEffect(() => () => call('browser_hide'), [])
}
