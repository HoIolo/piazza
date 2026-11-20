import { useRef, type KeyboardEvent } from 'react'

/** compositionend 之后的抑制窗口 */
const TAIL_MS = 80

export interface ImeGuard {
  /** 展开到输入元素上，用来跟踪组合态 */
  bind: {
    onCompositionStart: () => void
    onCompositionEnd: () => void
  }
  /** 这次按键是否落在输入法组合期内——是则不该触发提交 */
  isComposing: (e: KeyboardEvent<Element>) => boolean
}

/**
 * 输入法回车保护。
 *
 * 中文输入靠回车确认候选词，这个回车不能当成「提交」。
 *
 * 只看 e.nativeEvent.isComposing 不够：Tauri 在 macOS 上跑的是 WKWebView，
 * 而 WebKit 在确认候选词的那次 keydown 上已经把 isComposing 置回 false
 * （Chromium 则仍为 true）——于是同一份代码在浏览器里没事，打包后第一次
 * 回车就把半成品发出去。
 *
 * 故自行记录组合态，并在 compositionend 后留一小段抑制窗口，
 * 把「compositionend 早于 keydown」这种顺序差异一并盖住。
 */
export function useImeGuard(): ImeGuard {
  const composing = useRef(false)
  const endedAt = useRef(Number.NEGATIVE_INFINITY)

  return {
    bind: {
      onCompositionStart: () => {
        composing.current = true
      },
      onCompositionEnd: () => {
        composing.current = false
        endedAt.current = performance.now()
      },
    },
    isComposing: (e) =>
      composing.current ||
      e.nativeEvent.isComposing ||
      performance.now() - endedAt.current < TAIL_MS,
  }
}
