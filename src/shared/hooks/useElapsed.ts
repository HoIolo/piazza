import { useEffect, useState } from 'react'

/**
 * 从 startedAt 起每秒递增的已用时长；startedAt 为 null 时返回 null。
 *
 * 计时留在组件里而不是放进 store：耗时每秒都在变，写进全局状态会让
 * 所有订阅者跟着每秒重渲染一次，而真正需要它的只有那一行文字。
 */
export function useElapsed(startedAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (startedAt === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt])

  return startedAt === null ? null : Math.max(0, now - startedAt)
}
