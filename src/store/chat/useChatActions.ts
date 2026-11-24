import { useCallback } from 'react'
import type { ImageContent, StreamingBehavior } from '@/rpc/types'
import { editAndResend, forkAfterTurn } from './editFork'
import { dispatchPrompt, resumeTurn } from './sendPrompt'
import { stopNow } from './stopConfirm'
import { useChatStore } from './store'

/** 对话流操作：发送、编辑分叉重发、从助手回复分叉、排队与中断 */
export function useChatActions() {
  const isStreaming = useChatStore((s) => s.isStreaming)
  const sendPrompt = useCallback(
    (message: string, behavior: StreamingBehavior = 'steer', images: ImageContent[] = []) =>
      dispatchPrompt(message, behavior, images),
    [],
  )
  const editUserMessage = useCallback(
    (
      userIndex: number | undefined,
      rawText: string,
      nextMessage: string,
      images: ImageContent[] = [],
      onCommitted?: () => void,
    ) => editAndResend(userIndex, rawText, nextMessage, images, onCommitted),
    [],
  )
  const forkFromTurn = useCallback((userIndex?: number) => forkAfterTurn(userIndex), [])
  return {
    sendPrompt,
    editUserMessage,
    forkFromTurn,
    abort: stopNow,
    resume: resumeTurn,
    isStreaming,
  }
}
