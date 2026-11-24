import { useCallback, type RefObject } from 'react'
import type { DraftAttachment } from '@/shared/api/attachments'
import { useDraftAttachments } from '@/shared/hooks/useDraftAttachments'
import { useAppStore } from '@/store/app.store'
import { useChatStore } from '@/store/chat'

export function useAttachments(root: RefObject<HTMLElement | null>) {
  const files = useChatStore((state) => state.attachments)
  const sessionNonce = useAppStore((state) => state.sessionNonce)

  const append = useCallback((added: DraftAttachment[]) => {
    const store = useChatStore.getState()
    store.setAttachments([...store.attachments, ...added])
  }, [])

  const remove = useCallback((id: string) => {
    const store = useChatStore.getState()
    store.setAttachments(store.attachments.filter((file) => file.id !== id))
  }, [])

  const isCurrent = useCallback(
    () => useAppStore.getState().sessionNonce === sessionNonce,
    [sessionNonce],
  )

  return useDraftAttachments(root, { files, append, remove, isCurrent })
}
