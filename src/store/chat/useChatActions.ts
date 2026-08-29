import { useCallback } from 'react'
import { rpcClient } from '@/rpc/client'
import { useChatStore } from './store'
import { runRpc } from './rpcHelpers'

/** 对话流操作：发送与中断 */
export function useChatActions() {
  const isStreaming = useChatStore((s) => s.isStreaming)

  /** 发送消息。流式进行中改用 steer 排队，否则 pi 会直接拒绝该命令 */
  const sendPrompt = useCallback(
    (message: string) => {
      const text = message.trim()
      if (!text) return

      /*
       * 先上屏再发送。命令送不到 pi 时（会话没起来、进程已退出）这条回显会留在
       * 原地，用户至少看得见自己发过什么；否则草稿已清空、消息又没回传，
       * 打的字就凭空消失了。pi 回传同一条时 reducer 会把它顶掉。
       */
      useChatStore.getState().echoUserMessage(text)

      return runRpc(() =>
        rpcClient.send({
          type: 'prompt',
          message: text,
          ...(isStreaming ? { streamingBehavior: 'steer' as const } : {}),
        }),
      )
    },
    [isStreaming],
  )

  const abort = useCallback(() => runRpc(() => rpcClient.send({ type: 'abort' })), [])

  return { sendPrompt, abort, isStreaming }
}
