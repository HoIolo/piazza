import { useState } from 'react'
import { Dialog } from '@/design/primitives/Dialog'
import { Field } from '@/design/primitives/Field'
import { Select } from '@/design/primitives/Select'
import { TextField } from '@/design/primitives/TextField'
import { Toggle } from '@/design/primitives/Toggle'
import type { ModelConfig } from '@/shared/api/config'
import type { ApiType } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { formatTokens } from '@/shared/utils/format'
import { API_OPTIONS, DEFAULT_MAX_TOKENS } from '../constants'
import { putModel } from '../hooks/providerOps'
import { useModelDraft } from '../hooks/useModelDraft'
import type { ModelsConfigApi } from '../hooks/useModelsConfig'
import { numberText, parseNumber } from '../numberField'
import { ContextWindowField } from './ContextWindowField'
import styles from './FormDialog.module.css'

export interface ModelDialogProps {
  providerKey: string
  /** 该 provider 现有的模型，用于取被编辑项与查重 */
  models: ModelConfig[]
  /** null 为新建 */
  index: number | null
  onClose: () => void
  onCommit: ModelsConfigApi['commit']
}

const API_OVERRIDE_OPTIONS = [{ value: '', label: '跟随 Provider' }, ...API_OPTIONS]

/** 模型的新建 / 编辑对话框。按「保存」直接写入 models.json */
export function ModelDialog({ providerKey, models, index, onClose, onCommit }: ModelDialogProps) {
  const form = useModelDraft(models, index)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { draft, patch } = form

  const submit = async () => {
    const result = form.finish()
    if ('error' in result) {
      setError(result.error)
      return
    }
    setBusy(true)
    try {
      await onCommit((p) => putModel(p, providerKey, index, result.model))
      onClose()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={index === null ? '添加模型' : '编辑模型'}
      onClose={onClose}
      onConfirm={() => void submit()}
      busy={busy}
    >
      <div className={styles.form}>
        <Field label="模型 ID" hint="请求时发给 API 的名字，须与服务端一致">
          <TextField
            value={draft.id}
            monospace
            placeholder="如 claude-opus-5"
            autoFocus
            ariaLabel="模型 ID"
            onChange={(id) => patch({ id })}
          />
        </Field>

        <Field label="显示名称">
          <TextField
            value={draft.name ?? ''}
            placeholder="留空则显示模型 ID"
            ariaLabel="显示名称"
            onChange={(name) => patch({ name })}
          />
        </Field>

        <ContextWindowField
          choice={form.contextChoice}
          value={draft.contextWindow}
          onPick={form.pickContext}
          onCustom={(contextWindow) => patch({ contextWindow })}
        />

        <Field label="最大输出 token">
          <TextField
            value={numberText(draft.maxTokens)}
            type="number"
            placeholder={`留空则按 ${formatTokens(DEFAULT_MAX_TOKENS)} 算`}
            ariaLabel="最大输出 token"
            onChange={(v) => patch({ maxTokens: parseNumber(v) })}
          />
        </Field>

        <Field label="支持推理" inline>
          <Toggle
            checked={draft.reasoning ?? false}
            ariaLabel="支持推理"
            onChange={(reasoning) => patch({ reasoning })}
          />
        </Field>

        <Field label="支持图片输入" inline>
          <Toggle checked={form.hasImage} ariaLabel="支持图片输入" onChange={form.setImage} />
        </Field>

        <Field label="API 类型" hint="一般跟随 Provider，只有个别模型走不同接口时才改">
          <Select
            value={draft.api ?? ''}
            options={API_OVERRIDE_OPTIONS}
            ariaLabel="API 类型"
            onChange={(api) => patch({ api: (api || undefined) as ApiType | undefined })}
          />
        </Field>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
