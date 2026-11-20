import { rpcClient } from '@/rpc/client'
import { runRpc } from './rpcHelpers'
import { useChatStore } from './store'

/** 第一次 Esc 之后，等第二次确认的时间窗 */
const STOP_CONFIRM_MS = 2000

let timer: ReturnType<typeof setTimeout> | undefined

function disarm(): void {
  clearTimeout(timer)
  useChatStore.getState().setStopArmed(false)
}

/** 立即中断当前运行。点停止按钮走这里——点击本身已经是明确的意图 */
export function stopNow(): Promise<void> {
  disarm()
  return runRpc(() => rpcClient.send({ type: 'abort' }))
}

/**
 * Esc 停止的二次确认。
 *
 * 一次 Esc 就停太容易误触——关菜单、退输入法都会按它。第一次只是「上膛」，
 * 时间窗内再按一次才真的中断，过期就自动解除。
 *
 * 放在 store 层而不是输入框里：Esc 由全局快捷键接，焦点不在输入框时也得生效，
 * 而「已上膛」又要显示在输入框的按钮上，两边必须看同一份状态。
 */
export function requestStop(): void {
  const { isStreaming, stopArmed, setStopArmed } = useChatStore.getState()
  if (!isStreaming) return
  if (stopArmed) {
    void stopNow()
    return
  }
  setStopArmed(true)
  clearTimeout(timer)
  timer = setTimeout(disarm, STOP_CONFIRM_MS)
}
