import { useCallback, useState } from 'react'
import { useChatStore } from '@/store/chat/store'

/**
 * 「继续」按钮的点击与加载态。
 *
 * 切到新会话时 rpcReady 还是假的（pi 刚 spawn，还没回 get_state），但历史已经
 * 上屏、暂停标记也在，用户看到的就该是一个能点的按钮。点击在这里被收下，真正
 * 的发送由 resumeTurn 等就绪后再做。
 *
 * 图标在「pi 还没就绪」时也转圈：让那几百毫秒的空窗看起来是在等，而不是坏了。
 */
export function useResumeAction(resume: () => Promise<boolean>) {
  const rpcReady = useChatStore((s) => s.rpcReady)
  const [clicked, setClicked] = useState(false)
  const run = useCallback(() => {
    setClicked(true)
    void resume().finally(() => setClicked(false))
  }, [resume])
  return { pending: clicked || !rpcReady, run }
}
