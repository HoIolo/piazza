/**
 * 滚动锚点的测量与回补。
 *
 * 往上翻历史时，视口上方的内容随时可能变高（工具块展开、图片加载完、
 * 待办清单刷新）。浏览器默认只会把 scrollTop 原样保留，于是用户眼前的
 * 那几行会被推走。这里记住「视口顶部是哪一条轮次、偏了多少」，
 * 内容变化后把它的位移补回 scrollTop，视觉上完全不动。
 */

/** 小于 1px 的位移视为没动，避免亚像素抖动来回改 scrollTop */
const SLACK = 1

export interface Anchor {
  /** 视口顶部第一条可见轮次的 data-scroll-key */
  key: string | null
  /** 直接缓存对应节点，节点未卸载时 O(1) 定位，避免每次遍历全部子节点 */
  node: HTMLElement | null
  /** 该轮次顶部相对视口顶部的偏移 */
  offset: number
}

export const EMPTY_ANCHOR: Anchor = { key: null, node: null, offset: 0 }

function findByKey(content: Element, key: string): HTMLElement | null {
  const { children } = content
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i] as HTMLElement
    if (child.dataset.scrollKey === key) return child
  }
  return null
}

/** 记录当前视口顶部那一条 */
export function captureAnchor(scroller: HTMLElement, content: Element): Anchor {
  const top = scroller.getBoundingClientRect().top
  const { children } = content
  for (let i = 0; i < children.length; i += 1) {
    const row = children[i] as HTMLElement
    const rect = row.getBoundingClientRect()
    if (rect.bottom > top) {
      return { key: row.dataset.scrollKey ?? null, node: row, offset: rect.top - top }
    }
  }
  return EMPTY_ANCHOR
}

/** 按锚点把位移补回去；锚点那一条已不存在时什么也不做 */
export function restoreAnchor(scroller: HTMLElement, content: Element, anchor: Anchor): void {
  if (anchor.key === null) return
  const row = anchor.node?.isConnected ? anchor.node : findByKey(content, anchor.key)
  if (!row) return
  anchor.node = row
  const delta =
    row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset
  if (Math.abs(delta) >= SLACK) scroller.scrollTop += delta
}
