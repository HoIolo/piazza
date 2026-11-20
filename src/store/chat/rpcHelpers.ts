import { writeAppSettings } from '@/shared/api/config'
import { rpcClient } from '@/rpc/client'
import type { SessionState } from '@/rpc/types'
import { useAppStore } from '@/store/app.store'
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

let configurationQueue = Promise.resolve()

/** 模型与强度按用户操作顺序生效，并且只回写实际发起操作的会话。 */
export function applyAndSync(command: () => Promise<unknown>, saveDefault = false): Promise<void> {
  const nonce = useAppStore.getState().sessionNonce
  const current = () => useAppStore.getState().sessionNonce === nonce
  configurationQueue = configurationQueue.then(async () => {
    if (!current()) return
    try {
      await command()
      if (!current()) return
      const state = await rpcClient.send<SessionState>({ type: 'get_state' })
      if (current()) useChatStore.getState().setSession(state)
      if (saveDefault && state.model) {
        await writeAppSettings({
          defaultProvider: state.model.provider,
          defaultModel: state.model.id,
          defaultThinkingLevel: state.thinkingLevel,
        })
      }
    } catch (error) {
      if (current()) useChatStore.getState().setError(errorMessage(error))
    }
  })
  return configurationQueue
}
