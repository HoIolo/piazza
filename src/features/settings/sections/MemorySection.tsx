import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Pill } from '@/design/primitives/Pill'
import { Segmented } from '@/design/primitives/Segmented'
import type { AutoExtractMode, MemoryItem, MemoryScope } from '@/shared/api/memory'
import { useAppStore } from '@/store/app.store'
import { ClearScopeButton, HandoffCard, MemoryListCard } from '../components/MemoryCards'
import { MemoryDialog } from '../components/MemoryDialog'
import { MemorySettingsCard } from '../components/MemorySettingsCard'
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

function normalizeAutoMode(raw: unknown): AutoExtractMode {
  return raw === 'signal' || raw === 'off' ? raw : 'smart'
}

function MemoryToolbar({
  filter,
  projectLabel,
  query,
  filteredCount,
  confirmClear,
  onFilterChange,
  onQueryChange,
  onConfirmToggle,
  onClear,
  onNew,
}: {
  filter: ScopeFilter
  projectLabel: string
  query: string
  filteredCount: number
  confirmClear: boolean
  onFilterChange: (next: ScopeFilter) => void
  onQueryChange: (q: string) => void
  onConfirmToggle: (v: boolean) => void
  onClear: (scope: MemoryScope) => void
  onNew: () => void
}) {
  return (
    <div className={listStyles.toolbar}>
      <div className={listStyles.toolbarLeft}>
        <Segmented
          value={filter}
          options={[
            { value: 'all', label: '全部' },
            { value: 'global', label: '全局' },
            { value: 'project', label: projectLabel },
          ]}
          onChange={(v) => onFilterChange(v as ScopeFilter)}
        />
        <div className={listStyles.searchWrap}>
          <Search size={14} className={listStyles.searchIcon} />
          <input
            className={listStyles.searchInput}
            placeholder="筛选记忆标题、标签或正文…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
      </div>
      <div className={memStyles.toolbarActions}>
        <ClearScopeButton
          filter={filter}
          count={filteredCount}
          confirming={confirmClear}
          onConfirmToggle={onConfirmToggle}
          onClear={onClear}
        />
        <Pill icon={<Plus size={14} />} onClick={onNew}>
          新建记忆
        </Pill>
      </div>
    </div>
  )
}

/** 长期记忆管理：双层开关、节能自动提炼、Dream 整理去重、检索与压缩交接预览 */
export function MemorySection({ settings }: SectionProps) {
  const cwd = useAppStore((s) => s.currentCwd)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const enabled = settings.read('memory.enabled', true)
  const autoExtract = normalizeAutoMode(settings.read('memory.autoExtract', 'smart'))
  const autoDream = settings.read('memory.autoDream', true)
  const mem = useMemories(cwd, settingsOpen)
  const [filter, setFilter] = useState<ScopeFilter>('all')
  const [query, setQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [editing, setEditing] = useState<{ open: boolean; item: MemoryItem | null }>({
    open: false,
    item: null,
  })

  const items = useMemo(() => mem.overview?.items ?? [], [mem.overview])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => matchesMemory(item, filter, q))
  }, [items, filter, query])
  const globalCount = items.filter((i) => i.scope === 'global').length
  const projectCount = items.length - globalCount
  const projectName = mem.overview?.projectName ?? null
  const projectLabel = projectName ? `当前项目 (${projectName})` : '当前项目'

  return (
    <>
      <MemorySettingsCard
        enabled={enabled} autoExtract={autoExtract} autoDream={autoDream}
        globalCount={globalCount} projectCount={projectCount}
        memoryRoot={mem.overview?.memoryRoot} dream={mem.overview?.dream}
        consolidating={mem.consolidating} dreamNotice={mem.dreamNotice}
        onToggle={(v) => settings.update('memory.enabled', v)}
        onAutoExtractChange={(mode) => settings.update('memory.autoExtract', mode)}
        onAutoDreamChange={(v) => settings.update('memory.autoDream', v)}
        onConsolidate={() => void mem.runConsolidate()}
      />
      <MemoryToolbar
        filter={filter} projectLabel={projectLabel} query={query}
        filteredCount={filtered.length} confirmClear={confirmClear}
        onFilterChange={(next) => { setFilter(next); setConfirmClear(false) }}
        onQueryChange={setQuery} onConfirmToggle={setConfirmClear}
        onClear={(scope) => void mem.clearScope(scope)}
        onNew={() => setEditing({ open: true, item: null })}
      />
      {mem.error && <p className={listStyles.error}>{mem.error}</p>}
      <MemoryListCard
        loading={mem.loading} totalCount={items.length} items={filtered}
        onEdit={(item) => setEditing({ open: true, item })}
        onDelete={(item) => void mem.removeItem(item)}
      />
      <HandoffCard handoff={mem.overview?.handoff} onClear={() => void mem.dropHandoff()} />
      {editing.open && (
        <MemoryDialog
          item={editing.item} cwd={cwd} projectName={projectName}
          defaultScope={filter === 'global' ? 'global' : 'project'}
          onClose={() => setEditing({ open: false, item: null })}
          onSaved={mem.reload}
        />
      )}
    </>
  )
}
