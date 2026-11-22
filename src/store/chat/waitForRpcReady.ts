import { useChatStore } from './store'

/**
 * 等到会话真正可用为止。
 *
 * 切到一条新会话时，历史是从磁盘读的，很快就上屏；但 pi 那边还是一个刚 spawn
 * 的进程，要加载完 SDK、读完会话文件、回完 get_state 才有能力接命令。这中间
 * 有几秒的空窗，rpcReady 是假的。
 *
 * 「继续」这个动作在这段空窗里没有别的办法（必须由 pi 来跑），但也不该把用户
 * 挡在门外：收下这次点击，等它就绪再发出去。
 *
 * stillWanted 由调用方决定「还要不要继续等」：等待期间用户可能已经切到别的
 * 会话或关掉了这一轮，那这次点击就该作废，不能把命令发给后来居上的会话。
 */
export function waitForRpcReady(stillWanted: () => boolean, timeoutMs = 30_000): Promise<boolean> {
  if (useChatStore.getState().rpcReady) return Promise.resolve(true)
  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      clearTimeout(timer)
      unsubscribe()
      resolve(ready)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    const unsubscribe = useChatStore.subscribe((s) => {
      if (!stillWanted() || s.error?.fatal) finish(false)
      else if (s.rpcReady) finish(true)
    })
  })
}
