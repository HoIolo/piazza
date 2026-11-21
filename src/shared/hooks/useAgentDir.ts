import { useEffect, useState } from 'react'
import { getAgentDir } from '@/shared/api/agentResources'

/** 只问一次：agent 目录整个进程生命周期内不会变（要变就是重启应用了） */
let cached: Promise<string> | null = null

function readAgentDir(): Promise<string> {
  cached ??= getAgentDir().catch((reason: unknown) => {
    cached = null
    throw reason
  })
  return cached
}

/**
 * 应用自己的 pi agent 目录（`~/.piazza/agent`）。
 *
 * 界面里凡是原来写死 `~/.pi/agent` 的地方都该用它——目录是隔离过的，
 * 写死会指到 CLI 那份上去，看着像配置存错了地方。
 * 读不到（浏览器里跑、命令失败）时返回空串，调用方自行决定怎么退化。
 */
export function useAgentDir(): string {
  const [dir, setDir] = useState('')

  useEffect(() => {
    let active = true
    readAgentDir()
      .then((value) => {
        if (active) setDir(value)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  return dir
}
