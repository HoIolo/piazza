import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/app.store'

/**
 * 右侧面板是会话级属性：切到没开过面板的会话要收起，切回开过面板的会话要恢复。
 *
 * 键用 `liveSessionPath`——pi 实际打开的那个会话文件，而不是「请求打开哪个」。
 * 新会话的文件名只有 pi 知道，用请求路径会把两个新会话混成同一个键。
 * 新会话阶段还没有文件名，用空串当键，切走时同样会被存下来。
 */
export function useSessionPanelMemory(): void {
  const key = useAppStore((s) => s.liveSessionPath ?? '')

  // 上一次生效的键。首帧不该触发恢复——那时面板还没被用户动过
  const prev = useRef<string | null>(null)

  useEffect(() => {
    const { savePanelForSession, restorePanelForSession } = useAppStore.getState()
    if (prev.current === null) {
      prev.current = key
      return
    }
    if (prev.current === key) return
    savePanelForSession(prev.current)
    restorePanelForSession(key)
    prev.current = key
  }, [key])
}
