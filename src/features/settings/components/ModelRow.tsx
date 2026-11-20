import { Pencil, Trash2 } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import type { ModelConfig } from '@/shared/api/config'
import { formatTokens } from '@/shared/utils/format'
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from '../constants'
import styles from './ModelRow.module.css'

export interface ModelRowProps {
  model: ModelConfig
  onEdit: () => void
  onRemove: () => void
}

/** 模型一行：名字、ID 与几个一眼能读的能力标签。改动进对话框 */
export function ModelRow({ model, onEdit, onRemove }: ModelRowProps) {
  const name = model.name?.trim() || model.id || '未命名模型'
  const tags = [
    `上下文 ${formatTokens(model.contextWindow ?? DEFAULT_CONTEXT_WINDOW)}`,
    `输出 ${formatTokens(model.maxTokens ?? DEFAULT_MAX_TOKENS)}`,
    ...(model.reasoning ? ['推理'] : []),
    ...(model.input?.includes('image') ? ['图片'] : []),
  ]

  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <span className={styles.name}>{name}</span>
        {name !== model.id && <code className={styles.id}>{model.id}</code>}
      </div>
      <div className={styles.tags}>
        {tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </div>
      <div className={styles.actions}>
        <IconButton ariaLabel={`编辑模型 ${name}`} title="编辑" size="sm" onClick={onEdit}>
          <Pencil size={14} />
        </IconButton>
        <IconButton
          ariaLabel={`删除模型 ${name}`}
          title="删除"
          size="sm"
          tone="danger"
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
    </li>
  )
}
