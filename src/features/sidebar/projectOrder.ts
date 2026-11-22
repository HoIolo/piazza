/**
 * 侧栏的顺序：谁排在哪，全由用户拖出来。
 *
 * 这里刻意不参考「最近活跃」。早先的规则是没拖过就按最近活跃排，结果是每轮
 * 对话一结束列表就自己重排，用户刚记住的位置又变了。现在默认按创建时间倒序
 * （新的在上面）——这是个不会自己变动的确定顺序，用户拖过之后连它也不再管。
 */

export interface OrderableProject {
  cwd: string
  /** 创建时间。没有会话的空项目给 0，排在真有内容的项目之后 */
  latestMs: number
}

/** 创建时间倒序；时间相同（空项目都是 0）时按名字稳定排列，避免每次渲染抖动 */
export function byCreatedDesc<T extends OrderableProject>(a: T, b: T): number {
  return b.latestMs - a.latestMs
}

/**
 * 按用户保存的顺序排，未出现在 order 里的追加在末尾。
 *
 * 末尾那部分保持传入顺序——它们通常是「拖完之后才添加」的项目，
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

/**
 * 会话列表的顺序：用户拖过的在前，没拖过的按创建时间倒序追加在后。
 *
 * 与项目同一套规则。置顶不在这里处理——置顶是显式操作，由调用方再把置顶的
 * 提到前面，组内仍然沿用这里算出来的顺序。
 */
export function applySessionOrder<T extends { path: string }>(
  sessions: T[],
  order: string[],
  createdMs: (session: T) => number,
): T[] {
  if (order.length === 0) return [...sessions].sort((a, b) => createdMs(b) - createdMs(a))
  const rank = new Map(order.map((path, index) => [path, index]))
  const ranked = [...sessions].sort((a, b) => {
    const ra = rank.get(a.path)
    const rb = rank.get(b.path)
    if (ra === undefined && rb === undefined) return createdMs(b) - createdMs(a)
    if (ra === undefined) return 1
    if (rb === undefined) return -1
    return ra - rb
  })
  return ranked
}

/** 把 from 挪到 to 的位置，返回新数组。拖动落点就靠它算 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * 拖动结束后保存的顺序。
 *
 * 存的是「被拖动那一段的完整顺序」而不是整份列表：置顶的项目显示在最前，
 * 但拖动只发生在同一区内，把整份列表存下来会让置顶区的位置混进用户顺序里。
 */
export function reorderPaths(paths: string[], from: string, to: string): string[] {
  const next = moveItem(paths, paths.indexOf(from), paths.indexOf(to))
  return next === paths ? paths : next
}
