import { Trash2 } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import type { MemoryHandoff, MemoryItem, MemoryScope } from '@/shared/api/memory'
import listStyles from '../sections/CapabilityList.module.css'
import memStyles from '../sections/MemorySection.module.css'
import { MemoryRow } from './MemoryRow'

export function HandoffCard({
  handoff,
  onClear,
}: {
  handoff: MemoryHandoff | null | undefined
  onClear: () => void
}) {
  if (!handoff) return null
  return (
    <Card title="上次压缩交接快照">
      <pre className={memStyles.handoffBody}>{handoff.content}</pre>
      <div className={memStyles.handoffFooter}>
        <span className={memStyles.pathHint}>{handoff.filePath}</span>
        <Pill icon={<Trash2 size={13} />} onClick={onClear}>
          清除交接
        </Pill>
      </div>
    </Card>
  )
}

export function ClearScopeButton({
  filter,
  count,
  confirming,
  onConfirmToggle,
  onClear,
}: {
  filter: 'all' | MemoryScope
  count: number
  confirming: boolean
  onConfirmToggle: (v: boolean) => void
  onClear: (scope: MemoryScope) => void
}) {
  if (filter === 'all' || count === 0) return null
  const label = filter === 'global' ? '全局' : '当前项目'
  if (confirming) {
    return (
      <button
        type="button"
        className={memStyles.dangerPill}
        onClick={() => {
          onConfirmToggle(false)
          onClear(filter)
        }}
        onBlur={() => onConfirmToggle(false)}
      >
        <Trash2 size={13} />
        确认清空{label}记忆
      </button>
    )
  }
  return (
    <Pill icon={<Trash2 size={13} />} onClick={() => onConfirmToggle(true)}>
      清空{label}
    </Pill>
  )
}

export function MemoryListCard({
  loading,
  totalCount,
  items,
  onEdit,
  onDelete,
}: {
  loading: boolean
  totalCount: number
  items: MemoryItem[]
  onEdit: (item: MemoryItem) => void
  onDelete: (item: MemoryItem) => void
}) {
  return (
    <Card>
      <div className={listStyles.list}>
        {loading ? (
          <p className={listStyles.empty}>正在加载记忆…</p>
        ) : items.length === 0 ? (
          <p className={listStyles.empty}>
            {totalCount === 0
              ? '暂无已保存记忆，对话中的偏好与项目经验会自动沉淀，也可点击右上角「新建记忆」'
              : '没有匹配的记忆'}
          </p>
        ) : (
          items.map((item) => (
            <MemoryRow
              key={`${item.scope}:${item.id}`}
              item={item}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item)}
            />
          ))
        )}
      </div>
    </Card>
  )
}
