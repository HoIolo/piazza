import { Pencil, Trash2 } from 'lucide-react'
import { Toggle } from '@/design/primitives/Toggle'
import type { McpServerEntry } from '@/shared/api/agentResources'
import styles from '../sections/CapabilityList.module.css'

export interface McpServerRowProps {
  name: string
  entry: McpServerEntry
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

function describeEndpoint(entry: McpServerEntry): string {
  if (entry.url) return entry.url
  return [entry.command ?? '', ...(entry.args ?? [])].filter(Boolean).join(' ')
}

export function McpServerRow({ name, entry, onToggle, onEdit, onDelete }: McpServerRowProps) {
  const isHttp = Boolean(entry.url && !entry.command)
  return (
    <div className={styles.item}>
      <div className={styles.itemMain}>
        <div className={styles.itemHead}>
          <span className={styles.itemName}>{name}</span>
          <span className={`${styles.badge} ${isHttp ? styles.badgeAccent : ''}`}>
            {isHttp ? 'HTTP' : 'stdio'}
          </span>
        </div>
        {entry.description && <p className={styles.itemDesc}>{entry.description}</p>}
        <span className={styles.itemPath}>{describeEndpoint(entry)}</span>
      </div>
      <div className={styles.itemActions}>
        <Toggle checked={entry.enabled !== false} onChange={onToggle} />
        <button
          type="button"
          className={styles.iconBtn}
          title="编辑"
          aria-label="编辑"
          onClick={onEdit}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
          title="删除"
          aria-label="删除"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
