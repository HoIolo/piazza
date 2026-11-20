import { useState } from 'react'
import { Dialog } from '@/design/primitives/Dialog'
import { Field } from '@/design/primitives/Field'
import { Select } from '@/design/primitives/Select'
import { TextField } from '@/design/primitives/TextField'
import type { ProviderConfig } from '@/shared/api/config'
import type { ApiType } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { API_OPTIONS } from '../constants'
import { putProvider, renameKey, type ProviderMap } from '../hooks/providerOps'
import type { ModelsConfigApi } from '../hooks/useModelsConfig'
import styles from './FormDialog.module.css'

export interface ProviderDialogProps {
  providers: ProviderMap
  /** null 为新建 */
  providerKey: string | null
  onClose: () => void
  onCommit: ModelsConfigApi['commit']
}

const EMPTY: ProviderConfig = { api: 'openai-completions', models: [] }

/** 空串字段不写进文件：pi 把空的 apiKey 当成「配置了但解析不出」，模型会整个不可用 */
function compact(draft: ProviderConfig): ProviderConfig {
  const next = { ...draft }
  for (const field of ['name', 'baseUrl', 'apiKey'] as const) {
    const value = next[field]?.trim()
    if (value) next[field] = value
    else delete next[field]
  }
  return next
}

/** Provider 的新建 / 编辑对话框。按「保存」直接写入 models.json */
export function ProviderDialog({ providers, providerKey, onClose, onCommit }: ProviderDialogProps) {
  const [key, setKey] = useState(providerKey ?? '')
  const [draft, setDraft] = useState<ProviderConfig>(providerKey ? providers[providerKey] : EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const patch = (fields: Partial<ProviderConfig>) => setDraft((d) => ({ ...d, ...fields }))

  const validate = (): string | null => {
    const trimmed = key.trim()
    if (!trimmed) return '标识不能为空'
    if (trimmed !== providerKey && providers[trimmed]) return `标识「${trimmed}」已被占用`
    if (!draft.baseUrl?.trim()) return 'Base URL 不能为空'
    return null
  }

  const submit = async () => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    const trimmed = key.trim()
    setBusy(true)
    try {
      await onCommit((p) => {
        // 改了标识就先原位改名，再写入内容，卡片在列表里的位置才不会跳
        const renamed =
          providerKey && providerKey !== trimmed ? renameKey(p, providerKey, trimmed) : p
        return putProvider(renamed, trimmed, compact(draft))
      })
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={providerKey ? '编辑 Provider' : '添加 Provider'}
      onClose={onClose}
      onConfirm={() => void submit()}
      busy={busy}
    >
      <div className={styles.form}>
        <Field label="显示名称">
          <TextField
            value={draft.name ?? ''}
            placeholder="如 我的中转站"
            autoFocus
            ariaLabel="显示名称"
            onChange={(name) => patch({ name })}
          />
        </Field>

        <Field label="标识" hint="写进 models.json 的键名，也是设置里「默认 Provider」要填的值">
          <TextField
            value={key}
            monospace
            placeholder="如 my-proxy"
            ariaLabel="标识"
            onChange={setKey}
          />
        </Field>

        <Field label="API 类型">
          <Select
            value={draft.api ?? 'openai-completions'}
            options={API_OPTIONS}
            ariaLabel="API 类型"
            onChange={(api) => patch({ api: api as ApiType })}
          />
        </Field>

        <Field label="Base URL">
          <TextField
            value={draft.baseUrl ?? ''}
            monospace
            placeholder="https://api.example.com/v1"
            ariaLabel="Base URL"
            onChange={(baseUrl) => patch({ baseUrl })}
          />
        </Field>

        <Field label="API Key" hint="留空则用 /login 存下的凭据；支持 $环境变量 与 !命令 取值">
          <TextField
            value={draft.apiKey ?? ''}
            secret
            placeholder="sk-…"
            ariaLabel="API Key"
            onChange={(apiKey) => patch({ apiKey })}
          />
        </Field>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
