import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { captureAnchor } from './scrollAnchor'
import {
  FOLLOW,
  createScrollState,
  detachFollow,
  distanceOf,
  pinToBottom,
  reengageFollow,
  reportAway,
  restoreScrollPosition,
  syncMetrics,
  syncThumbDirection,
  type Measurement,
  type ScrollDirection,
  type ScrollState,
} from './scrollState'
import { startSmoothJump } from './smoothJump'
import { useScrollWatch } from './scrollWatch'

export interface StickToBottom {
  awayFromBottom: boolean
  /** 点击浮钮：平滑滚到底并恢复自动跟随 */
  jumpToBottom: () => void
  /** 立即贴底并开启自动跟随（新发消息、切到贴底会话） */
  snapToBottom: () => void
  /** 恢复到历史阅读位置并暂停自动跟随（切回浏览中的会话） */
  restorePosition: (scrollTop: number) => void
  /** 用户主动脱离底部（点击左侧刻度跳转等） */
  detach: () => void
  /** 自定义滚动条滑块拖拽同步 */
  syncThumbScroll: (direction: ScrollDirection) => void
  /** 顶部加载更早历史并补偿 scrollTop 后刷新度量与锚点 */
  notifyPrepend: () => void
  /** 当前是否处于自动跟随底部的状态（供会话滚动位置持久化复用） */
  isFollowing: () => boolean
}

function handlePrepend(s: ScrollState, m: Measurement, setAway: (v: boolean) => void): void {
  syncMetrics(s, m.el)
  if (!s.following) {
    s.anchor = captureAnchor(m.el, m.content)
    reportAway(s, distanceOf(m.el) > FOLLOW, setAway)
  }
}

function useStickActions(
  stateRef: { current: ScrollState },
  measure: () => Measurement | null,
  setAway: (away: boolean) => void,
): Omit<StickToBottom, 'awayFromBottom' | 'isFollowing'> {
  const run = useCallback(
    (fn: (s: ScrollState, m: Measurement) => void) => {
      const m = measure()
      if (m) fn(stateRef.current, m)
    },
    [measure, stateRef],
  )
  const jumpToBottom = useCallback(
    () => run((s, m) => startSmoothJump(s, m.el, setAway)),
    [run, setAway],
  )
  const snapToBottom = useCallback(
    () =>
      run((s, m) => {
        reengageFollow(s, m.el, setAway)
        pinToBottom(s, m.el)
      }),
    [run, setAway],
  )
  const restorePosition = useCallback(
    (top: number) => run((s, m) => restoreScrollPosition(s, m, top, setAway)),
    [run, setAway],
  )
  const detach = useCallback(
    () => run((s, m) => detachFollow(s, m.el, m.content, setAway)),
    [run, setAway],
  )
  const syncThumbScroll = useCallback(
    (dir: ScrollDirection) => run((s, m) => syncThumbDirection(s, m, dir, setAway)),
    [run, setAway],
  )
  const notifyPrepend = useCallback(
    () => run((s, m) => handlePrepend(s, m, setAway)),
    [run, setAway],
  )
  return useMemo(
    () => ({ jumpToBottom, snapToBottom, restorePosition, detach, syncThumbScroll, notifyPrepend }),
    [jumpToBottom, snapToBottom, restorePosition, detach, syncThumbScroll, notifyPrepend],
  )
}

/**
 * 聊天流自动贴底控制器。
 *
 * 统一接管「流式跟随 / 用户上滚脱离 / 滚动锚点防跳动 / 平滑回底 / 会话位置恢复」，
 * 避免多个 hook 通过 DOM dataset 互相猜状态导致的自动滚动失效。
 */
export function useStickToBottom(
  ref: RefObject<HTMLElement | null>,
  /** 本轮是否仍在进行。由 true 变 false 时状态行/改动卡片首次出现，paint 前再贴一次底 */
  busy: boolean,
): StickToBottom {
  const stateRef = useRef(createScrollState())
  const [awayFromBottom, setAwayFromBottom] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    const content = el?.firstElementChild
    return el && content ? { el, content } : null
  }, [ref])

  const actions = useStickActions(stateRef, measure, setAwayFromBottom)
  const isFollowing = useCallback(() => stateRef.current.following, [stateRef])
  useScrollWatch(stateRef, measure, setAwayFromBottom)

  useLayoutEffect(() => {
    const m = measure()
    if (m && stateRef.current.following && !stateRef.current.smoothScrolling) {
      pinToBottom(stateRef.current, m.el)
    }
  }, [measure, busy])

  return useMemo(
    () => ({ awayFromBottom, isFollowing, ...actions }),
    [awayFromBottom, isFollowing, actions],
  )
}
