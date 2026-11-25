import { FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { MEMORY_CATEGORY_LABELS, type MemoryItem } from '@/shared/api/memory'
import { openPathWith } from '@/shared/api/pi'
import listStyles from '../sections/CapabilityList.module.css'
import memStyles from '../sections/MemorySection.module.css'

export interface MemoryRowProps {
  item: MemoryItem
  onEdit: () => void
  onDelete: () => void
}

function parentDirOf(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return idx > 0 ? filePath.slice(0, idx) : filePath
}

function shortDate(iso: string): string {
  if (!iso) return ''
  return iso.slice(0, 16).replace('T', ' ')
}

export function MemoryRow({ item, onEdit, onDelete }: MemoryRowProps) {
  return (
    <div className={listStyles.item}>
      <div className={listStyles.itemMain}>
        <div className={listStyles.itemHead}>
          <span className={listStyles.itemName}>{item.title}</span>
          <span
            className={`${listStyles.badge} ${item.scope === 'project' ? listStyles.badgeAccent : ''}`}
          >
            {item.scope === 'global' ? '全局' : '项目'}
          </span>
          <span className={listStyles.badge}>{MEMORY_CATEGORY_LABELS[item.category]}</span>
        </div>
        {item.summary && <p className={listStyles.itemDesc}>{item.summary}</p>}
        <div className={memStyles.metaRow}>
          {item.tags.map((tag) => (
            <span key={tag} className={memStyles.tag}>
              #{tag}
            </span>
          ))}
          {item.updatedAt && <span className={memStyles.time}>{shortDate(item.updatedAt)}</span>}
        </div>
      </div>
      <div className={listStyles.itemActions}>
        <button
          type="button"
          className={listStyles.iconBtn}
          title="编辑记忆"
          aria-label="编辑记忆"
          onClick={onEdit}
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className={listStyles.iconBtn}
          title="在文件夹中查看"
          aria-label="在文件夹中查看"
          onClick={() => void openPathWith('', parentDirOf(item.filePath))}
        >
          <FolderOpen size={14} />
        </button>
        <button
          type="button"
          className={`${listStyles.iconBtn} ${listStyles.iconBtnDanger}`}
          title="删除记忆"
          aria-label="删除记忆"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
