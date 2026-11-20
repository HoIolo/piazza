import { useCallback } from 'react'
import { rpcClient } from '@/rpc/client'
import type { ExportResult, ExtensionUiResponse, ThinkingLevel } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { useProjectsStore } from '../projects.store'
import { applyContextWindowPreset, syncCompactionForModel } from './contextWindow'
import { useChatStore } from './store'
import { applyAndSync, runRpc } from './rpcHelpers'

/** 会话级配置操作：模型、推理强度、上下文、命名与导出 */
export function useSessionActions() {
  const setModel = useCallback(async (provider: string, modelId: string) => {
    await applyAndSync(() => rpcClient.send({ type: 'set_model', provider, modelId }), true)
    void syncCompactionForModel(provider, modelId)
  }, [])

  const setThinkingLevel = useCallback(
    (level: ThinkingLevel) =>
      applyAndSync(() => rpcClient.send({ type: 'set_thinking_level', level }), true),
    [],
  )

  const renameSession = useCallback(async (name: string) => {
    await applyAndSync(() => rpcClient.send({ type: 'set_session_name', name }))
    void useProjectsStore.getState().refresh()
  }, [])

  const setContextWindow = useCallback(
    (contextWindow: number) => applyContextWindowPreset(contextWindow),
    [],
  )

  /** 导出为 HTML，返回落盘路径供「点此打开」使用；失败时返回 null */
  const exportHtml = useCallback(async (): Promise<string | null> => {
    try {
      const data = await rpcClient.send<ExportResult>({ type: 'export_html' })
      return data.path ?? null
    } catch (error) {
      useChatStore.getState().setError(errorMessage(error))
      return null
    }
  }, [])

  /**
   * 回应扩展的 UI 请求。
   *
   * 这是通知而非命令：pi 不会为它回一个 response 帧，因此直接投递、
   * 不等应答，否则会一直挂到超时。
   */
  const answerDialog = useCallback(
    (payload: Omit<ExtensionUiResponse, 'type'>) =>
      runRpc(async () => {
        await rpcClient.notify({ type: 'extension_ui_response', ...payload })
        const store = useChatStore.getState()
        if (store.pendingDialog?.id === payload.id) store.setPendingDialog(null)
      }),
    [],
  )

  return { setModel, setThinkingLevel, setContextWindow, renameSession, exportHtml, answerDialog }
}
