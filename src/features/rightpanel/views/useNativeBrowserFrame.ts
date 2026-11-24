import { useEffect, useRef, type RefObject } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { errorMessage } from '@/shared/utils/error'

/** 与 src-tauri/src/browser.rs 的 Bounds 对应，单位是逻辑像素（= CSS px） */
interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface NativeBrowserTarget {
  kind: 'url' | 'html'
  value: string
  revision: number
}

interface NativeBrowserOptions {
  target: NativeBrowserTarget | null
  enabled: boolean
  layoutKey: string
  onError: (message: string) => void
}

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function rectOf(el: HTMLElement): Bounds {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

function invokeNative(
  command: string,
  args?: Record<string, unknown>,
  onError?: (msg: string) => void,
): void {
  if (!isTauriEnv()) return
  void invoke(command, args).then(
    () => onError?.(''),
    (reason: unknown) => onError?.(errorMessage(reason)),
  )
}

function showPayload(target: NativeBrowserTarget, bounds: Bounds): Record<string, unknown> {
  return target.kind === 'html'
    ? { htmlPath: target.value, revision: target.revision, bounds }
    : { url: target.value, revision: target.revision, bounds }
}

/**
 * 面板与侧栏开关带有 280ms CSS 宽度过渡；原生子视图不参与 DOM 排版，
 * 在过渡期内按帧同步一次矩形，避免视图停在旧坐标或动画结束才闪现。
 */
function trackTransition(push: () => void): () => void {
  const until = performance.now() + 340
  let raf = 0
  const step = () => {
    push()
    if (performance.now() < until) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

/**
 * 把一块 DOM 区域变成原生子 webview 的显示区。
 *
 * 只有当地址/revision 变化或刚恢复可见时才调用 `browser_show`，
 * 随后的尺寸与位置变化改走轻量 `browser_bounds`，避免重复建视图或抢导航。
 */
export function useNativeBrowserFrame(
  frameRef: RefObject<HTMLDivElement | null>,
  { target, enabled, layoutKey, onError }: NativeBrowserOptions,
): void {
  const shownKeyRef = useRef<string | null>(null)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const targetKey = target ? `${target.kind}:${target.value}#${target.revision}` : null

  useEffect(() => {
    const el = frameRef.current
    if (!el || !target || !targetKey || !enabled) {
      if (shownKeyRef.current !== null) {
        shownKeyRef.current = null
        invokeNative('browser_hide')
      }
      return
    }

    const push = () => {
      const bounds = rectOf(el)
      if (bounds.width < 2 || bounds.height < 2) {
        if (shownKeyRef.current !== null) {
          shownKeyRef.current = null
          invokeNative('browser_hide')
        }
        return
      }
      if (shownKeyRef.current === targetKey) {
        invokeNative('browser_bounds', { bounds })
        return
      }
      shownKeyRef.current = targetKey
      invokeNative('browser_show', showPayload(target, bounds), (msg) => {
        if (msg) shownKeyRef.current = null
        onErrorRef.current(msg)
      })
    }

    const stopTransition = trackTransition(push)
    const observer = new ResizeObserver(push)
    observer.observe(el)
    window.addEventListener('resize', push)

    return () => {
      stopTransition()
      observer.disconnect()
      window.removeEventListener('resize', push)
    }
  }, [frameRef, target, targetKey, enabled, layoutKey])

  useEffect(() => () => invokeNative('browser_hide'), [])
}
