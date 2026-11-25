import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Pill } from '@/design/primitives/Pill'
import { Segmented } from '@/design/primitives/Segmented'
import type { MemoryItem, MemoryScope } from '@/shared/api/memory'
import { useAppStore } from '@/store/app.store'
import {
  ClearScopeButton,
  HandoffCard,
  MemoryListCard,
  MemorySettingsCard,
} from '../components/MemoryCards'
import { MemoryDialog } from '../components/MemoryDialog'
import type { SectionProps } from './AppearanceSection'
import listStyles from './CapabilityList.module.css'
import memStyles from './MemorySection.module.css'
import { useMemories } from './useMemories'

type ScopeFilter = 'all' | MemoryScope

function matchesMemory(item: MemoryItem, filter: ScopeFilter, q: string): boolean {
  if (filter !== 'all' && item.scope !== filter) return false
  if (!q) return true
  const haystack = `${item.title}\n${item.summary}\n${item.content}\n${item.id}\n${item.tags.join(' ')}`
  return haystack.toLowerCase().includes(q)
}

/** 长期记忆管理：双层（全局 + 当前项目）开关、检索、新建/编辑/删除与压缩交接预览 */
export function MemorySection({ settings }: SectionProps) {
  const cwd = useAppStore((s) => s.currentCwd)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const enabled = settings.read('memory.enabled', true)
  const { overview, loading, error, reload, removeItem, clearScope, dropHandoff } = useMemories(
    cwd,
    settingsOpen,
  )
  const [filter, setFilter] = useState<ScopeFilter>('all')
  const [query, setQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [editing, setEditing] = useState<{ open: boolean; item: MemoryItem | null }>({
    open: false,
    item: null,
  })

  const items = useMemo(() => overview?.items ?? [], [overview])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => matchesMemory(item, filter, q))
  }, [items, filter, query])
  const globalCount = items.filter((i) => i.scope === 'global').length
  const projectCount = items.length - globalCount
  const projectLabel = overview?.projectName ? `当前项目 (${overview.projectName})` : '当前项目'

  return (
    <>
      <MemorySettingsCard
        enabled={enabled}
        globalCount={globalCount}
        projectCount={projectCount}
        memoryRoot={overview?.memoryRoot}
        onToggle={(v) => settings.update('memory.enabled', v)}
      />

      <div className={listStyles.toolbar}>
        <div className={listStyles.toolbarLeft}>
          <Segmented
            value={filter}
            options={[
              { value: 'all', label: '全部' },
              { value: 'global', label: '全局' },
              { value: 'project', label: projectLabel },
            ]}
            onChange={(v) => {
              setFilter(v as ScopeFilter)
              setConfirmClear(false)
            }}
          />
          <div className={listStyles.searchWrap}>
            <Search size={14} className={listStyles.searchIcon} />
            <input
              className={listStyles.searchInput}
              placeholder="筛选记忆标题、标签或正文…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className={memStyles.toolbarActions}>
          <ClearScopeButton
            filter={filter}
            count={filtered.length}
            confirming={confirmClear}
            onConfirmToggle={setConfirmClear}
            onClear={(scope) => void clearScope(scope)}
          />
          <Pill icon={<Plus size={14} />} onClick={() => setEditing({ open: true, item: null })}>
            新建记忆
          </Pill>
        </div>
      </div>

      {error && <p className={listStyles.error}>{error}</p>}

      <MemoryListCard
        loading={loading}
        totalCount={items.length}
        items={filtered}
        onEdit={(item) => setEditing({ open: true, item })}
        onDelete={(item) => void removeItem(item)}
      />

      <HandoffCard handoff={overview?.handoff} onClear={() => void dropHandoff()} />

      {editing.open && (
        <MemoryDialog
          item={editing.item}
          cwd={cwd}
          projectName={overview?.projectName ?? null}
          defaultScope={filter === 'global' ? 'global' : 'project'}
          onClose={() => setEditing({ open: false, item: null })}
          onSaved={reload}
        />
      )}
    </>
  )
}
