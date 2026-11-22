import {
  detachFollow,
  type Measurement,
  type ScrollDirection,
  type ScrollState,
} from './scrollState'

const KEY_DIR: Record<string, ScrollDirection> = {
  PageUp: 'up',
  Home: 'up',
  ArrowUp: 'up',
  PageDown: 'down',
  End: 'down',
  ArrowDown: 'down',
}

/** 仅在 following=true 首次上滚时检查，避免 120Hz 惯性滚轮反复遍历 DOM 与读取样式 */
function canInnerScrollUp(target: EventTarget | null, boundary: HTMLElement): boolean {
  let node = target instanceof HTMLElement ? target : null
  while (node && node !== boundary) {
    if (node.scrollTop > 0 && node.scrollHeight > node.clientHeight + 1) {
      const overflowY = getComputedStyle(node).overflowY
      if (overflowY === 'auto' || overflowY === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
}

function keyDirection(e: KeyboardEvent): ScrollDirection | null {
  const t = e.target
  if (
    t instanceof HTMLElement &&
    (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
  )
    return null
  if (e.key === ' ' && e.shiftKey) return 'up'
  return KEY_DIR[e.key] ?? null
}

function noteIntent(
  s: ScrollState,
  m: Measurement,
  dir: ScrollDirection,
  setAway: (v: boolean) => void,
): void {
  s.userIntent = dir
  if (dir === 'up' && (s.following || s.smoothScrolling)) detachFollow(s, m.el, m.content, setAway)
}

/** 绑定滚轮、触摸、键盘与按住指针状态；只由真实用户输入触发脱离自动跟随 */
export function bindUserInputs(
  s: ScrollState,
  m: Measurement,
  setAway: (v: boolean) => void,
): () => void {
  let touchY: number | null = null
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
    if (e.deltaY > 1) return noteIntent(s, m, 'down', setAway)
    if (e.deltaY >= -1) return
    s.userIntent = 'up'
    if ((s.following || s.smoothScrolling) && !canInnerScrollUp(e.target, m.el)) {
      detachFollow(s, m.el, m.content, setAway)
    }
  }
  const onTouchStart = (e: TouchEvent) => (touchY = e.touches[0]?.clientY ?? null)
  const onTouchMove = (e: TouchEvent) => {
    const nextY = e.touches[0]?.clientY
    if (touchY === null || nextY === undefined) return
    const delta = nextY - touchY
    touchY = nextY
    if (delta > 2) noteIntent(s, m, 'up', setAway)
    else if (delta < -2) noteIntent(s, m, 'down', setAway)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = keyDirection(e)
    if (dir) noteIntent(s, m, dir, setAway)
  }
  const onDown = () => (s.pointerDown = true)
  const onUp = () => (s.pointerDown = false)
  const passive = { passive: true } as const
  m.el.addEventListener('wheel', onWheel, passive)
  m.el.addEventListener('touchstart', onTouchStart, passive)
  m.el.addEventListener('touchmove', onTouchMove, passive)
  m.el.addEventListener('keydown', onKeyDown)
  m.el.addEventListener('pointerdown', onDown, passive)
  window.addEventListener('pointerup', onUp, passive)
  window.addEventListener('pointercancel', onUp, passive)
  return () => {
    s.pointerDown = false
    m.el.removeEventListener('wheel', onWheel)
    m.el.removeEventListener('touchstart', onTouchStart)
    m.el.removeEventListener('touchmove', onTouchMove)
    m.el.removeEventListener('keydown', onKeyDown)
    m.el.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
}
