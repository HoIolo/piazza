/** 一条已发出、还在等应答的命令 */
export type Pending = {
  slotId: string
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}
/** 往监听器集合里加一个回调，返回退订函数 */
export function subscribe<T>(set: Set<T>, cb: T): () => void {
  set.add(cb)
  return () => {
    set.delete(cb)
  }
}
