import { useEffect, useRef, useState } from 'react'
import {
  accountsRpc,
  type AccountNotice,
  type AccountPrompt,
  type AccountProvider,
  type AuthMethod,
} from '@/rpc/accounts'
import { errorMessage } from '@/shared/utils/error'
import { refreshRuntimeAfterSave } from '@/store/chat/refreshRuntime'

export interface AccountFlow {
  name: string
  notice?: AccountNotice
  prompt?: { id: string; prompt: AccountPrompt }
}

function useAccountConnection() {
  const slot = useRef<string | null>(null)
  const [providers, setProviders] = useState<AccountProvider[] | null>(null)
  const [flow, setFlow] = useState<AccountFlow | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const id = crypto.randomUUID()
    slot.current = id
    const off = accountsRpc.onEvent((event, source) => {
      if (source !== id) return
      setFlow((flow) => {
        if (!flow) return flow
        if (event.type === 'account_notice') {
          if (event.notice.type === 'progress' && flow.notice) return flow
          return { ...flow, notice: event.notice }
        }
        if (event.type === 'account_prompt') return { ...flow, prompt: event }
        return flow.prompt?.id === event.id ? { ...flow, prompt: undefined } : flow
      })
    })
    const started = accountsRpc.start({ cwd: '' }, id)
    void started
      .then(() => accountsRpc.send<AccountProvider[]>({ type: 'list_accounts' }, id))
      .then((rows) => {
        if (slot.current === id) setProviders(rows)
      })
      .catch((reason) => {
        if (slot.current === id) setError(errorMessage(reason))
      })

    return () => {
      slot.current = null
      off()
      void started.then(() => accountsRpc.stop(id)).catch(() => undefined)
    }
  }, [retry])

  return {
    slot, providers, setProviders, flow, setFlow, error, setError,
    retry: () => { setError(''); setRetry((n) => n + 1) },
  }
}

export function useProviderAccounts() {
  const connection = useAccountConnection()
  const { slot, setError, setFlow, setProviders } = connection
  const cancelling = useRef(false)
  const [busy, setBusy] = useState(false)

  async function change(provider: AccountProvider, method?: AuthMethod) {
    const id = slot.current
    if (!id || busy) return
    cancelling.current = false
    setError('')
    setBusy(true)
    if (method) setFlow({ name: provider.name })
    try {
      const rows = await accountsRpc.send<AccountProvider[]>(
        method
          ? { type: 'account_login', provider: provider.id, method }
          : { type: 'account_logout', provider: provider.id },
        id,
      )
      refreshRuntimeAfterSave()
      if (slot.current === id) setProviders(rows)
    } catch (reason) {
      if (slot.current === id && !cancelling.current) setError(errorMessage(reason))
    } finally {
      if (slot.current === id) {
        setFlow(null)
        setBusy(false)
      }
    }
  }

  function notify(payload: Record<string, unknown>) {
    const id = slot.current
    if (id) void accountsRpc.notify(payload, id).catch((reason) => setError(errorMessage(reason)))
  }

  return {
    providers: connection.providers,
    flow: connection.flow,
    error: connection.error,
    busy,
    change,
    retry: connection.retry,
    cancel: () => {
      cancelling.current = true
      notify({ type: 'account_cancel' })
    },
    answer: (id: string, value: string) => notify({ type: 'account_answer', id, value }),
  }
}
