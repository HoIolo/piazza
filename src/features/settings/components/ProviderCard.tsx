import { Plus, Trash2 } from 'lucide-react'
import { Select } from '@/design/primitives/Select'
import { TextField } from '@/design/primitives/TextField'
import type { ModelConfig, ProviderConfig } from '@/shared/api/config'
import type { ApiType } from '@/rpc/types'
import { API_OPTIONS } from '../constants'
import { ModelRow } from './ModelRow'
import styles from './ProviderCard.module.css'

export interface ProviderCardProps {
  providerKey: string
  provider: ProviderConfig
  onChange: (provider: ProviderConfig) => void
  onRename: (key: string) => void
  onRemove: () => void
}

export function ProviderCard({
  providerKey,
  provider,
  onChange,
  onRename,
  onRemove,
}: ProviderCardProps) {
  const models = provider.models ?? []
  const patch = (fields: Partial<ProviderConfig>) => onChange({ ...provider, ...fields })
  const patchModels = (next: ModelConfig[]) => patch({ models: next })

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <TextField
          value={provider.name ?? ''}
          placeholder="Provider 显示名"
          onChange={(name) => patch({ name })}
          ariaLabel="Provider 显示名"
        />
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          aria-label="删除 Provider"
        >
          <Trash2 size={15} />
        </button>
      </header>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.labelText}>标识（models.json 中的键名）</span>
          <TextField value={providerKey} monospace onChange={onRename} />
        </label>

        <label className={styles.field}>
          <span className={styles.labelText}>API 类型</span>
          <Select
            value={provider.api ?? 'openai-completions'}
            options={API_OPTIONS}
            onChange={(api) => patch({ api: api as ApiType })}
          />
        </label>

        <label className={styles.fieldWide}>
          <span className={styles.labelText}>Base URL</span>
          <TextField
            value={provider.baseUrl ?? ''}
            monospace
            placeholder="https://api.example.com/v1"
            onChange={(baseUrl) => patch({ baseUrl })}
          />
        </label>

        <label className={styles.fieldWide}>
          <span className={styles.labelText}>API Key</span>
          <TextField
            value={provider.apiKey ?? ''}
            secret
            placeholder="留空则使用 auth.json 或环境变量"
            onChange={(apiKey) => patch({ apiKey })}
          />
        </label>
      </div>

      <div className={styles.modelsHead}>
        <span className={styles.modelsTitle}>模型（{models.length}）</span>
        <button
          type="button"
          className={styles.addModel}
          onClick={() => patchModels([...models, { id: '' }])}
        >
          <Plus size={14} />
          添加模型
        </button>
      </div>

      {models.map((model, index) => (
        <ModelRow
          key={index}
          model={model}
          onChange={(next) => patchModels(models.map((m, i) => (i === index ? next : m)))}
          onRemove={() => patchModels(models.filter((_, i) => i !== index))}
        />
      ))}
    </div>
  )
}
