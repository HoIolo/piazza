import { Pencil, Plus, Trash2 } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import type { ProviderConfig } from '@/shared/api/config'
import { apiLabel } from '../constants'
import { ModelRow } from './ModelRow'
import styles from './ProviderCard.module.css'

export interface ProviderCardProps {
  providerKey: string
  provider: ProviderConfig
  onEdit: () => void
  onRemove: () => void
  onAddModel: () => void
  onEditModel: (index: number) => void
  onRemoveModel: (index: number) => void
}

/**
 * Provider 概览卡片：只读，改动一律进对话框。
 *
 * 之前是一整片可编辑表单堆在页面上，每个 provider 十来个输入框，
 * 找一个模型要在一屏输入框里翻。概览只留看得懂的几项，
 * 输入框全部收进对话框——要改哪个点哪个。
 */
export function ProviderCard({
  providerKey,
  provider,
  onEdit,
  onRemove,
  onAddModel,
  onEditModel,
  onRemoveModel,
}: ProviderCardProps) {
  const models = provider.models ?? []
  const name = provider.name?.trim() || providerKey

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div className={styles.headText}>
          <div className={styles.titleRow}>
            <span className={styles.name}>{name}</span>
            {name !== providerKey && <code className={styles.key}>{providerKey}</code>}
          </div>
          <div className={styles.meta}>
            <span>{apiLabel(provider.api)}</span>
            {provider.baseUrl && <code className={styles.url}>{provider.baseUrl}</code>}
          </div>
        </div>
        <div className={styles.actions}>
          <IconButton ariaLabel="编辑 Provider" title="编辑" onClick={onEdit}>
            <Pencil size={15} />
          </IconButton>
          <IconButton ariaLabel="删除 Provider" title="删除" tone="danger" onClick={onRemove}>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </header>

      {models.length === 0 ? (
        <p className={styles.empty}>还没有模型</p>
      ) : (
        <ul className={styles.models}>
          {models.map((model, index) => (
            <ModelRow
              key={`${model.id}-${index}`}
              model={model}
              onEdit={() => onEditModel(index)}
              onRemove={() => onRemoveModel(index)}
            />
          ))}
        </ul>
      )}

      <button type="button" className={styles.add} onClick={onAddModel}>
        <Plus size={14} />
        添加模型
      </button>
    </section>
  )
}
