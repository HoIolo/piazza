/**
 * 侧栏项目列表的排序：用户拖过就按用户的，没拖过才按最近活跃。
 *
 * 两条规则分开写而不是塞进排序回调里，是因为「拖过一次」这件事本身
 * 就是状态：只要有保存的顺序，就完全不该再参考 latestMs，否则
 * 用户排好的顺序会在下一轮对话结束时被悄悄重排回去。
 */

export interface OrderableProject {
  cwd: string
  latestMs: number
}

/**
 * 按用户保存的顺序排，未出现在 order 里的追加在末尾。
 *
 * 末尾那部分保持传入顺序——它们通常是「拖完之后才添加/才产生会话」的项目，
 * 插到最前面会把用户刚排好的列表顶下去。
 */
export function applyProjectOrder<T extends OrderableProject>(projects: T[], order: string[]): T[] {
  if (order.length === 0) return projects
  const rank = new Map(order.map((cwd, index) => [cwd, index]))
  return [...projects].sort((a, b) => {
    const ra = rank.get(a.cwd)
    const rb = rank.get(b.cwd)
    if (ra === undefined && rb === undefined) return 0
    if (ra === undefined) return 1
    if (rb === undefined) return -1
    return ra - rb
  })
}

/** 把 from 挪到 to 的位置，返回新数组。拖动落点就靠它算 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
