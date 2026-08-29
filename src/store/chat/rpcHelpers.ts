import { rpcClient } from '@/rpc/client'
import type { SessionState } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { useChatStore } from './store'

/** 执行一次 RPC 调用，失败时把错误落到 store 供 UI 展示 */
export async function runRpc(task: () => Promise<unknown>): Promise<void> {
  try {
    await task()
  } catch (error) {
    useChatStore.getState().setError(errorMessage(error))
  }
}

/**
 * 改动会话配置后回读一次状态。
 * pi 的 set_* 命令不广播状态变更，不主动拉就会让界面停留在旧值。
 */
export async function applyAndSync(command: () => Promise<unknown>): Promise<void> {
  return runRpc(async () => {
    await command()
    const state = await rpcClient.send<SessionState>({ type: 'get_state' })
    useChatStore.getState().setSession(state)
  })
}
