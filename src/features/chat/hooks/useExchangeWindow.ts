import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { getSessionScroll, saveSessionScroll } from '@/store/chat'

const INITIAL_WINDOW = 20
const WINDOW_STEP = 20
const TOP_LOAD_THRESHOLD = 240
const BOTTOM_SLACK = 24

interface WindowState {
  key: string
  count: number
}

function useRestoreScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  sessionKey: string,
  sessionPath: string | null,
  total: number,
) {
  const prevMetaRef = useRef<{ key: string; total: number }>({ key: '', total: 0 })

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el || total === 0) return
    const prev = prevMetaRef.current
    const switched = prev.key !== sessionKey
    const grew = !switched && total > prev.total
    prevMetaRef.current = { key: sessionKey, total }
    if (switched) {
      const saved = getSessionScroll(sessionPath)
      const restoreMid = Boolean(saved && !saved.atBottom)
      if (restoreMid) el.dataset.restoringScroll = 'true'
      el.scrollTop = restoreMid && saved ? saved.scrollTop : el.scrollHeight
    } else if (grew) {
      el.scrollTop = el.scrollHeight
    }
  }, [containerRef, sessionKey, sessionPath, total])
}

function useScrollPersistence(
  containerRef: RefObject<HTMLDivElement | null>,
  sessionPath: string | null,
  start: number,
  loadOlder: () => void,
) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK
      saveSessionScroll(sessionPath, el.scrollTop, atBottom)
      if (start > 0 && el.scrollTop < TOP_LOAD_THRESHOLD) loadOlder()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [containerRef, loadOlder, sessionPath, start])
}

/**
 * 对齐 Codex TurnList 的历史分页窗口与滚动位置恢复：
 * 长会话初始只渲染最近 20 轮，滚近顶部自动向前展开并保持锚点不跳动；
 * 切换回已看过的会话时直接恢复上次阅读位置。
 */
export function useExchangeWindow(
  containerRef: RefObject<HTMLDivElement | null>,
  sessionKey: string,
  sessionPath: string | null,
  total: number,
) {
  const [win, setWin] = useState<WindowState>({ key: sessionKey, count: INITIAL_WINDOW })
  const visibleCount = win.key === sessionKey ? win.count : INITIAL_WINDOW
  const start = Math.max(0, total - visibleCount)
  const anchorRef = useRef<{ prevHeight: number; prevTop: number } | null>(null)

  const loadOlder = useCallback(() => {
    if (start <= 0) return
    const el = containerRef.current
    if (el) anchorRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop }
    setWin((prev) => {
      const base = prev.key === sessionKey ? prev.count : INITIAL_WINDOW
      return { key: sessionKey, count: base + WINDOW_STEP }
    })
  }, [containerRef, sessionKey, start])

  const ensureVisible = useCallback(
    (index: number) => {
      if (index >= start) return
      setWin({ key: sessionKey, count: Math.max(INITIAL_WINDOW, total - index) })
    },
    [sessionKey, start, total],
  )

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const el = containerRef.current
    if (!anchor || !el) return
    anchorRef.current = null
    el.scrollTop = anchor.prevTop + (el.scrollHeight - anchor.prevHeight)
  }, [containerRef, start])

  useRestoreScroll(containerRef, sessionKey, sessionPath, total)
  useScrollPersistence(containerRef, sessionPath, start, loadOlder)

  return { start, loadOlder, ensureVisible }
}
