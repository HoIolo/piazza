import { useEffect, useLayoutEffect } from 'react'
import { EMPTY_ANCHOR, captureAnchor, restoreAnchor, type Anchor } from './scrollAnchor'

/**
 * 两个阈值，对齐 Codex 的 conversation viewport（`nearBottom` / `pinnedToBottom`）：
 * - FOLLOW 96px：还算「在跟随」。超出即停止自动滚，同时浮出「回到底部」。
 * - PINNED 10px：算「真贴着底」，用于驱动浮钮的精确显隐。
 *
 * 自动滚动本身只看 FOLLOW 派生的 following——见 useScrollWatch 里的说明。
 */
export const FOLLOW = 96
export const PINNED = 10

/** 距底部还有多少像素 */
export function distanceOf(el: HTMLElement): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

export interface Measurement {
  el: HTMLElement
  content: Element
  distance: number
}

export interface ScrollState {
  /** 首次接管前不动滚动位置，交给 useExchangeWindow 的会话恢复 */
  initialized: boolean
  /** 距底 <= FOLLOW */
  following: boolean
  /** 距底 <= PINNED */
  pinnedToBottom: boolean
  anchor: Anchor
  /** 上一次渲染的最后一条轮次，用来区分「新增一条」和「往同一条里追加」 */
  lastKey: string | null
  sessionKey: string
}

export function initialState(sessionKey: string): ScrollState {
  return {
    initialized: false,
    following: true,
    pinnedToBottom: true,
    anchor: EMPTY_ANCHOR,
    lastKey: null,
    sessionKey,
  }
}

export type Measure = () => Measurement | null

interface Options {
  /** 必须是 ref（名字带 Ref 后缀），react-hooks 的 immutability 规则据此放行写入 */
  stateRef: { current: ScrollState }
  measure: Measure
  sync: () => void
}

/** 滚到底 */
export function pinToBottom(el: HTMLElement): void {
  el.scrollTop = el.scrollHeight
}

/**
 * 监听滚动与尺寸变化。
 *
 * 盯的是内容的实际高度，而不是「消息条数变了没有」。后者看着够用，
 * 实际漏掉了最主要的场景：流式输出是往同一个文本块里一个字一个字追加的，
 * 条数和块数自始至终不变，于是整段回答刷完，滚动条一次都不会动。
 */
export function useScrollWatch({ stateRef, measure, sync }: Options): void {
  useEffect(() => {
    const m = measure()
    if (!m) return
    const onScroll = () => {
      sync()
      // 滚动本身改变了「视口顶部是哪一条」，锚点要跟着重算
      if (!stateRef.current.pinnedToBottom) {
        stateRef.current.anchor = captureAnchor(m.el, m.content)
      }
    }
    m.el.addEventListener('scroll', onScroll, { passive: true })

    /*
     * 观察里面那一坨内容：滚动容器自己的高度是固定的，长高的是它的孩子。
     * 这条路径处理「同一条消息里流式追加」「图片加载完撑高」，
     * 要求真贴底（PINNED）才滚——否则用户刚往上滚一点就会被拽回来。
     */
    const observer = new ResizeObserver(() => {
      if (m.el.dataset.restoringScroll === 'true') {
        delete m.el.dataset.restoringScroll
        sync()
        return
      }
      /*
       * 判据只有一条：用户是否主动上滚过（following）。
       *
       * 不逐次量「长高前是否贴底」——ResizeObserver 的回调跑在布局提交之后，
       * 此时内容已经长高，量到的永远是「不贴底」；而滚动又只能排到下一帧，
       * 一帧的滞后就足以让第一次长高被判成「用户已滚开」，之后再也不跟。
       * 这正是「输出内容多时完全不滚」的根因。
       *
       * following 只在滚动事件里被用户行为改写，不受内容长高影响，
       * 所以拿它当唯一判据既简单又不会误判。
       */
      if (stateRef.current.following) pinToBottom(m.el)
      else restoreAnchor(m.el, m.content, stateRef.current.anchor)
      sync()
    })
    observer.observe(m.content)
    observer.observe(m.el)

    return () => {
      m.el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [measure, stateRef, sync])
}

/**
 * 消息列表变化时按「最后一条是否新增」分档决定要不要贴底：
 * 新增一条只要在 FOLLOW 内就跟；往同一条里追加则要真贴底（PINNED）。
 * 不这么分，用户刚往上滚一点就会被流式输出拽回底部。
 *
 * 用 useLayoutEffect：滚动要在 paint 前完成，否则会先看到旧位置再跳一下。
 */
export function useFollowOnMessages(
  { stateRef, measure, sync }: Options,
  sessionKey: string,
  lastKey: string | null,
): void {
  useLayoutEffect(() => {
    if (stateRef.current.sessionKey !== sessionKey) {
      stateRef.current = initialState(sessionKey)
    }
    const m = measure()
    if (!m) return
    if (!stateRef.current.initialized) {
      // 首帧不接管：位置由 useExchangeWindow 的会话恢复决定
      if (m.el.scrollHeight <= m.el.clientHeight) return
      stateRef.current.initialized = true
      stateRef.current.lastKey = lastKey
      sync()
      return
    }
    stateRef.current.lastKey = lastKey
    /*
     * 只认 following（用户是否还在底部），不认 pinnedToBottom：
     * 后者是「距底 <= 10px」，而这个 effect 跑在内容已经长高之后，
     * 新高度一撑，pinnedToBottom 必然为 false，追加就再也不跟了。
     */
    if (stateRef.current.following) pinToBottom(m.el)
    else restoreAnchor(m.el, m.content, stateRef.current.anchor)
    sync()
  }, [measure, stateRef, sync, sessionKey, lastKey])
}
