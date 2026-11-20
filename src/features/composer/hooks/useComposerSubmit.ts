import type { StreamingBehavior } from '@/rpc/types'
import { prepareAttachments, type DraftAttachment } from '@/shared/api/attachments'
import { useAppStore } from '@/store/app.store'
import { useChatActions, useChatStore } from '@/store/chat'

let submitting = false

export function useComposerSubmit(closePanel: () => void) {
  const { sendPrompt } = useChatActions()
  const submit = async (behavior: StreamingBehavior = 'steer') => {
    if (submitting) return
    const store = useChatStore.getState()
    if (!store.rpcReady || store.sessionLoading || store.pendingDialog) return
    const { message, images } = prepareAttachments(store.draft, store.attachments)
    if (!message && !images.length) return
    if (rejectUnsupportedImages(images.length)) return
    const text = store.draft
    const files = store.attachments
    const nonce = useAppStore.getState().sessionNonce
    // 同步清空加锁，防止连续 Enter 重发；失败时恢复原草稿和附件。
    submitting = true
    store.setDraft('')
    store.setAttachments([])
    closePanel()
    try {
      const sent = await sendPrompt(message, behavior, images)
      if (!sent) restoreDraft(nonce, text, files)
    } finally {
      submitting = false
    }
  }
  return { submit }
}

function rejectUnsupportedImages(count: number) {
  const store = useChatStore.getState()
  const input = store.session?.model?.input
  if (!count || !input || input.includes('image')) return false
  store.setError('当前模型不支持图片输入，请选择支持图片的模型后发送。')
  return true
}

function restoreDraft(nonce: number, text: string, files: DraftAttachment[]) {
  if (useAppStore.getState().sessionNonce !== nonce) return
  const store = useChatStore.getState()
  store.setDraft([text, store.draft].filter(Boolean).join('\n'))
  store.setAttachments([...files, ...store.attachments])
}
