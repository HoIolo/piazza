import type { CSSProperties } from 'react'

/** 与 Codex PointerSensor 一致的拖拽触发距离阈值（px），避免轻点误触 */
export const DRAG_ACTIVATION_PX = 6

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [data-no-drag="true"]'

/** 忽略行尾按钮/菜单上的按下事件，不抢占普通点击 */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
}

/**
 * 计算 Codex 同款插入指示线的位置索引（0..items.length）：
 * - 向上拖时指示线画在目标行上方（index = overIdx）
 * - 向下拖时指示线画在目标行下方（index = overIdx + 1）
 */
export function computeDropIndicatorIndex(
  items: string[],
  activeId: string | null,
  overId: string | null,
): number | null {
  if (!activeId || !overId || activeId === overId) return null
  const from = items.indexOf(activeId)
  const to = items.indexOf(overId)
  if (from === -1 || to === -1) return null
  return from < to ? to + 1 : to
}

/**
 * 在指定容器内按指针 Y 坐标命中同区可排序节点：
 * - 命中矩形内部直接返回；
 * - 落在行间隙或首尾之外时取最近节点，保证插入指示线绝不闪烁断档。
 */
export function hitTestSortItem(
  container: HTMLElement | null,
  selector: string,
  attr: string,
  clientY: number,
): string | null {
  if (!container) return null
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector))
  if (nodes.length === 0) return null

  let nearest: { id: string | null; dist: number } = { id: null, dist: Infinity }
  for (const node of nodes) {
    const rect = node.getBoundingClientRect()
    const id = node.getAttribute(attr)
    if (clientY >= rect.top && clientY <= rect.bottom) return id
    const mid = (rect.top + rect.bottom) / 2
    const dist = Math.abs(clientY - mid)
    if (dist < nearest.dist) nearest = { id, dist }
  }
  return nearest.id
}

/** 拖动中节点的纵轴跟随位移（对齐 Codex restrictToVerticalAxis） */
export function dragRowStyle(active: boolean, offsetY: number): CSSProperties | undefined {
  if (!active) return undefined
  return { transform: `translate3d(0, ${Math.round(offsetY)}px, 0)` }
}

/** 拖动接近滚动容器边缘时温和自动滚动 */
export function autoScrollTree(tree: HTMLElement | null, clientY: number): void {
  if (!tree) return
  const rect = tree.getBoundingClientRect()
  const edge = 36
  if (clientY < rect.top + edge) tree.scrollTop -= 8
  else if (clientY > rect.bottom - edge) tree.scrollTop += 8
}
