import { useState } from 'react'
import { ChevronRight, Trash2 } from 'lucide-react'
import { Select } from '@/design/primitives/Select'
import { TextField } from '@/design/primitives/TextField'
import { Toggle } from '@/design/primitives/Toggle'
import type { ModelConfig } from '@/shared/api/config'
import type { ApiType } from '@/rpc/types'
import { API_OPTIONS } from '../constants'
import styles from './ModelRow.module.css'

export interface ModelRowProps {
  model: ModelConfig
  onChange: (model: ModelConfig) => void
  onRemove: () => void
}

/** 数字字段的读写：空串表示「不设置」，交给 pi 用默认值 */
function numberField(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

function parseNumber(text: string): number | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function ModelRow({ model, onChange, onRemove }: ModelRowProps) {
  const [expanded, setExpanded] = useState(false)
  const patch = (fields: Partial<ModelConfig>) => onChange({ ...model, ...fields })

  return (
    <div className={styles.row}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <ChevronRight size={14} className={styles.chevron} data-expanded={expanded} />
          <span className={styles.id}>{model.id || '未命名模型'}</span>
          {model.name && <span className={styles.name}>{model.name}</span>}
        </button>
        <button type="button" className={styles.remove} onClick={onRemove} aria-label="删除模型">
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.labelText}>模型 ID</span>
            <TextField
              value={model.id}
              monospace
              placeholder="如 claude-opus-5"
              onChange={(id) => patch({ id })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.labelText}>显示名称</span>
            <TextField value={model.name ?? ''} onChange={(name) => patch({ name })} />
          </label>

          <label className={styles.field}>
            <span className={styles.labelText}>API 类型</span>
            <Select
              value={model.api ?? ''}
              options={[{ value: '', label: '跟随 Provider' }, ...API_OPTIONS]}
              onChange={(api) => patch({ api: (api || undefined) as ApiType | undefined })}
            />
          </label>

          <div className={styles.field}>
            <span className={styles.labelText}>支持推理</span>
            <Toggle
              checked={model.reasoning ?? false}
              onChange={(reasoning) => patch({ reasoning })}
              ariaLabel="支持推理"
            />
          </div>

          <label className={styles.field}>
            <span className={styles.labelText}>上下文窗口</span>
            <TextField
              value={numberField(model.contextWindow)}
              type="number"
              onChange={(v) => patch({ contextWindow: parseNumber(v) })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.labelText}>最大输出</span>
            <TextField
              value={numberField(model.maxTokens)}
              type="number"
              onChange={(v) => patch({ maxTokens: parseNumber(v) })}
            />
          </label>
        </div>
      )}
    </div>
  )
}
