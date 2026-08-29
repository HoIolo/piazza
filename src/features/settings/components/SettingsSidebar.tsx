import { ArrowLeft, Search } from 'lucide-react'
import { SECTION_GROUPS, type SectionId } from '../sections'
import styles from './SettingsSidebar.module.css'

export interface SettingsSidebarProps {
  current: SectionId
  query: string
  onQueryChange: (query: string) => void
  onSelect: (id: SectionId) => void
  onBack: () => void
}

export function SettingsSidebar({
  current,
  query,
  onQueryChange,
  onSelect,
  onBack,
}: SettingsSidebarProps) {
  const keyword = query.trim().toLowerCase()
  const groups = SECTION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.label.toLowerCase().includes(keyword)),
  })).filter((group) => group.items.length > 0)

  return (
    <aside className={styles.sidebar}>
      <div className={styles.dragZone} data-tauri-drag-region />

      <button type="button" className={styles.back} onClick={onBack}>
        <ArrowLeft size={16} />
        返回应用
      </button>

      <div className={styles.search}>
        <Search size={15} className={styles.searchIcon} />
        <input
          className={styles.searchInput}
          placeholder="搜索设置..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>

      <nav className={styles.nav}>
        {groups.map((group) => (
          <div key={group.group} className={styles.group}>
            <h2 className={styles.groupTitle}>{group.group}</h2>
            {group.items.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={styles.item}
                data-active={id === current}
                onClick={() => onSelect(id)}
              >
                <Icon size={17} className={styles.icon} />
                <span className={styles.label}>{label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  )
}
