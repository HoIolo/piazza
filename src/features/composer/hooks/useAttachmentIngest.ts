import { useCallback, useState } from 'react'
import type { DraftAttachment } from '@/shared/api/attachments'
import { errorMessage } from '@/shared/utils/error'
import { useChatStore } from '@/store/chat'
import { useAppStore } from '@/store/app.store'

export function useAttachmentIngest() {
  const [reading, setReading] = useState(0)
  const [error, setError] = useState('')
  const ingest = useCallback(async (tasks: Array<() => Promise<DraftAttachment>>) => {
    const nonce = useAppStore.getState().sessionNonce
    setReading((count) => count + 1)
    setError('')
    const results = await Promise.allSettled(tasks.map((task) => task()))
    if (nonce === useAppStore.getState().sessionNonce) {
      const store = useChatStore.getState()
      store.setAttachments([
        ...store.attachments,
        ...results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
      ])
      const failures = results.flatMap((result) =>
        result.status === 'rejected' ? [errorMessage(result.reason)] : [],
      )
      if (failures.length) setError(failures.join('；'))
    }
    setReading((count) => count - 1)
  }, [])
  return { reading: reading > 0, error, setError, ingest }
}
