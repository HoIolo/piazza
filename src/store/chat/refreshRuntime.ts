import { useAppStore } from '@/store/app.store'
import { useChatStore } from './store'
import { hasPendingWork } from './types'

let timer: ReturnType<typeof setTimeout> | undefined
let unsubscribe: (() => void) | undefined

function reconnectWhenIdle() {
  const chat = useChatStore.getState()
  if (hasPendingWork(chat) || chat.sessionLoading || chat.messages.at(-1)?.local) {
    unsubscribe ??= useChatStore.subscribe(reconnectWhenIdle)
    return
  }

  unsubscribe?.()
  unsubscribe = undefined
  const app = useAppStore.getState()
  if (app.currentCwd) app.reconnectSession()
}

/** Coalesce closely spaced saves and keep the current turn and draft intact. */
export function refreshRuntimeAfterSave() {
  unsubscribe?.()
  unsubscribe = undefined
  clearTimeout(timer)
  timer = setTimeout(reconnectWhenIdle, 300)
}
