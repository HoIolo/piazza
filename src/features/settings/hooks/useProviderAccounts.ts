import { useEffect, useRef, useState } from 'react'
import {
  accountsRpc,
  type AccountEvent,
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

/** 进程启动失败时给出可操作的说法，而不是干巴巴的退出码 */
function describeAccountsExit(code: number | null, stderr: string): string {
  const tail = stderr.trim()
  if (tail) return `pi 账号进程退出：${tail.split('\n').slice(-3).join(' ')}`
  if (code === null) return 'pi 账号进程被系统终止（内置运行时可能未通过签名校验）'
  return `pi 账号进程异常退出（退出码 ${code}）`
}

/** 把账号事件并进当前授权流程。没有进行中的流程时忽略——此时事件无处可去 */
function nextFlow(flow: AccountFlow | null, event: AccountEvent): AccountFlow | null {
  if (!flow) return flow
  if (event.type === 'account_notice') {
    // 进度条只认第一条：后面的 message 往往只是同一句话换个说法，来回跳很晃眼
    if (event.notice.type === 'progress' && flow.notice) return flow
    return { ...flow, notice: event.notice }
  }
  if (event.type === 'account_prompt') return { ...flow, prompt: event }
  return flow.prompt?.id === event.id ? { ...flow, prompt: undefined } : flow
}

/** 订阅某个槽位的三条通道：事件、stderr、进程退出 */
function subscribeAccount(
  id: string,
  slot: React.RefObject<string | null>,
  stderrTail: React.RefObject<string>,
  handlers: {
    setFlow: (fn: (flow: AccountFlow | null) => AccountFlow | null) => void
    setError: (v: string) => void
  },
) {
  // 进程起不来时真正的死因在 stderr 里，不接这两条通道就只剩一句「尚未启动」
  const offStderr = accountsRpc.onStderr((text, source) => {
    if (source === id) stderrTail.current = text.trim().slice(-400)
  })
  const offExit = accountsRpc.onExit((info, source) => {
    if (source !== id || slot.current !== id) return
    handlers.setError(describeAccountsExit(info.code, info.stderr || stderrTail.current))
  })
  const offEvent = accountsRpc.onEvent((event, source) => {
    if (source === id) handlers.setFlow((flow) => nextFlow(flow, event))
  })
  return () => {
    offStderr()
    offExit()
    offEvent()
  }
}

function useAccountConnection() {
  const slot = useRef<string | null>(null)
  const stderrTail = useRef('')
  const [providers, setProviders] = useState<AccountProvider[] | null>(null)
  const [flow, setFlow] = useState<AccountFlow | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const id = crypto.randomUUID()
    slot.current = id
    const unsubscribe = subscribeAccount(id, slot, stderrTail, { setFlow, setError })
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
      unsubscribe()
      void started.then(() => accountsRpc.stop(id)).catch(() => undefined)
    }
  }, [retry])

  return {
    slot,
    providers,
    setProviders,
    flow,
    setFlow,
    error,
    setError,
    retry: () => {
      setError('')
      setRetry((n) => n + 1)
    },
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
