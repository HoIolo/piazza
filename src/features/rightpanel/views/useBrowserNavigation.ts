import { useState, type FormEvent } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { openPathWith } from '@/shared/api/pi'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { resolveBrowserInput, type ResolvedTarget } from './browserAddress'

type HistoryState = { items: ResolvedTarget[]; position: number; lastNonce: number }

function appendTarget(prev: HistoryState, next: ResolvedTarget, nonce: number): HistoryState {
  const curr = prev.items[prev.position]
  if (curr && curr.kind === next.kind && curr.value === next.value) {
    return { ...prev, lastNonce: nonce }
  }
  const items = [...prev.items.slice(0, prev.position + 1), next]
  return { items, position: items.length - 1, lastNonce: nonce }
}

function formatNavError(reason: unknown): string {
  return reason instanceof TypeError
    ? '请输入有效的网址或本地 .html 路径，例如 http://localhost:3000'
    : errorMessage(reason)
}

function openExternalTarget(current: ResolvedTarget | undefined, onError: (msg: string) => void) {
  if (!current) return
  const action = current.kind === 'html' ? openPathWith('', current.value) : openUrl(current.value)
  void action.catch((reason: unknown) => onError(errorMessage(reason)))
}

export function useBrowserNavigation() {
  const storeTarget = useAppStore((s) => s.browserTarget)
  const [history, setHistory] = useState<HistoryState>({ items: [], position: -1, lastNonce: 0 })
  const [revision, setRevision] = useState(0)
  const [address, setAddress] = useState('')
  const [navError, setNavError] = useState('')

  const pushNext = (next: ResolvedTarget, nonce: number) => {
    setHistory((prev) => appendTarget(prev, next, nonce))
    setAddress(next.value)
    setNavError('')
    setRevision((n) => n + 1)
  }

  if (storeTarget && storeTarget.nonce !== history.lastNonce) {
    pushNext({ kind: storeTarget.kind, value: storeTarget.value }, storeTarget.nonce)
  }

  const current = history.items[history.position]

  const step = (offset: number) => {
    const dest = history.items[history.position + offset]
    if (!dest) return
    setHistory((prev) => ({ ...prev, position: prev.position + offset }))
    setAddress(dest.value)
    setNavError('')
    setRevision((n) => n + 1)
  }

  const navigate = (event: FormEvent) => {
    event.preventDefault()
    if (!address.trim()) return
    try {
      pushNext(resolveBrowserInput(address), history.lastNonce)
    } catch (reason) {
      setNavError(formatNavError(reason))
    }
  }

  return {
    address,
    setAddress,
    navigate,
    error: navError,
    current,
    revision,
    reload: () => setRevision((n) => n + 1),
    openExternal: () => openExternalTarget(current, setNavError),
    step,
    canGoBack: history.position > 0,
    canGoForward: history.position + 1 < history.items.length,
  }
}
