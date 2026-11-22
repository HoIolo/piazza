import { useEffect } from 'react'
import { useAppStore } from '@/store/app.store'
import { shouldAutoCheck } from '@/store/updater.slice'

/** 启动后延迟几秒再查，别和首屏会话列表抢带宽 */
const DELAY_MS = 4000

/**
 * 启动时的静默更新检查。
 *
 * 只在真有新版本时弹窗；没更新、网络不通都安静收场——启动时报「检查失败」
 * 是纯噪音。节流记在 localStorage，重启太勤也不会每次都打请求。
 */
export function useAutoUpdate(): void {
  const check = useAppStore((s) => s.check)

  useEffect(() => {
    if (!shouldAutoCheck()) return
    const timer = setTimeout(() => void check(true), DELAY_MS)
    return () => clearTimeout(timer)
  }, [check])
}
