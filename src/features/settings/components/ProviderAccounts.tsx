import { useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { KeyRound, UserRound } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import { Row } from '@/design/primitives/Row'
import { TextField } from '@/design/primitives/TextField'
import type { AccountProvider, AuthMethod } from '@/rpc/accounts'
import { useProviderAccounts } from '../hooks/useProviderAccounts'
import { AccountAuthorization } from './AccountAuthorization'
import styles from './ProviderAccounts.module.css'

function ProviderRow({
  provider,
  method,
  busy,
  change,
}: {
  provider: AccountProvider
  method: AuthMethod
  busy: boolean
  change: (provider: AccountProvider, method?: AuthMethod) => Promise<void>
}) {
  const option = provider.methods.find((option) => option.type === method)
  if (!option) return null
  const stored = provider.stored === method
  return (
    <Row
      title={provider.name}
      description={stored ? '已保存授权' : option.label}
      control={
        <div className={styles.actions}>
          {stored && (
            <Pill
              variant="ghost"
              disabled={busy}
              onClick={() => {
                void ask('移除本机保存的授权？', { title: provider.name, kind: 'warning' }).then(
                  (ok) => {
                    if (ok) return change(provider)
                  },
                )
              }}
            >
              移除授权
            </Pill>
          )}
          <Pill
            icon={method === 'oauth' ? <UserRound size={14} /> : <KeyRound size={14} />}
            disabled={busy}
            onClick={() => void change(provider, method)}
          >
            {stored ? '重新授权' : method === 'oauth' ? '连接账号' : '配置 Key'}
          </Pill>
        </div>
      }
    />
  )
}

export function ProviderAccounts({ method }: { method: AuthMethod }) {
  const accounts = useProviderAccounts()
  const [query, setQuery] = useState('')
  const { flow, providers } = accounts
  const options = providers
    ?.filter(
      ({ id, name, methods }) =>
        methods.some((entry) => entry.type === method) &&
        [id, name, ...methods.map((entry) => entry.label)].some((text) =>
          text.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    )
    .sort(
      (a, b) =>
        Number(b.stored === method) - Number(a.stored === method) || a.name.localeCompare(b.name),
    )

  return (
    <div className={styles.panel}>
      {accounts.error && (
        <p className={styles.error} role="alert">
          {accounts.error}
        </p>
      )}
      {flow && (
        <AccountAuthorization flow={flow} onCancel={accounts.cancel} onAnswer={accounts.answer} />
      )}
      <TextField
        value={query}
        onChange={setQuery}
        ariaLabel="搜索内置服务商"
        placeholder="搜索服务商…"
      />
      <Card>
        {options?.map((provider) => (
          <ProviderRow
            key={provider.id}
            provider={provider}
            method={method}
            busy={accounts.busy}
            change={accounts.change}
          />
        ))}
        {options?.length === 0 && <p className={styles.empty}>没有匹配的服务商</p>}
        {!providers && (
          <div className={styles.empty}>
            {accounts.error ? (
              <Pill onClick={accounts.retry}>重试</Pill>
            ) : (
              '正在读取 Pi SDK 服务商…'
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
