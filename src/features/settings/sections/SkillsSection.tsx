import { useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import { Segmented } from '@/design/primitives/Segmented'
import type { SkillRecord } from '@/shared/api/agentResources'
import { useAppStore } from '@/store/app.store'
import { SkillDialog } from '../components/SkillDialog'
import { SkillRow } from '../components/SkillRow'
import { deleteSkill, useSkillsLoad } from './skillsParts'
import styles from './CapabilityList.module.css'

type ScopeFilter = 'all' | 'global' | 'project'

function matchesSkill(item: SkillRecord, filter: ScopeFilter, query: string): boolean {
  if (filter !== 'all' && item.scope !== filter) return false
  if (!query) return true
  return (
    item.name.toLowerCase().includes(query) ||
    item.id.toLowerCase().includes(query) ||
    item.description.toLowerCase().includes(query)
  )
}

/** 技能管理：浏览、创建、编辑全局 skills 与当前项目 .pi/skills */
export function SkillsSection() {
  const cwd = useAppStore((s) => s.currentCwd)
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ScopeFilter>('all')
  const [query, setQuery] = useState('')
  const [nonce, setNonce] = useState(0)
  const [editing, setEditing] = useState<{ open: boolean; skill: SkillRecord | null }>({
    open: false,
    skill: null,
  })

  useSkillsLoad(cwd, nonce, setSkills, setError, setLoading)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return skills.filter((item) => matchesSkill(item, filter, q))
  }, [skills, filter, query])

  const handleDelete = (skill: SkillRecord) =>
    deleteSkill(skill, cwd, () => setNonce((n) => n + 1), setError)

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Segmented
            value={filter}
            options={[
              { value: 'all', label: '全部' },
              { value: 'global', label: '全局' },
              { value: 'project', label: '当前项目' },
            ]}
            onChange={(v) => setFilter(v as ScopeFilter)}
          />
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="筛选技能..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <Pill icon={<Plus size={14} />} onClick={() => setEditing({ open: true, skill: null })}>
          新建技能
        </Pill>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <Card>
        <div className={styles.list}>
          {loading ? (
            <p className={styles.empty}>正在扫描技能目录…</p>
          ) : filtered.length === 0 ? (
            <p className={styles.empty}>
              {skills.length === 0
                ? '暂无已安装的技能，点击右上角「新建技能」开始'
                : '没有匹配的技能'}
            </p>
          ) : (
            filtered.map((skill) => (
              <SkillRow
                key={`${skill.scope}:${skill.dirPath}`}
                skill={skill}
                onEdit={() => setEditing({ open: true, skill })}
                onDelete={() => void handleDelete(skill)}
              />
            ))
          )}
        </div>
      </Card>
      {editing.open && (
        <SkillDialog
          skill={editing.skill}
          cwd={cwd}
          onClose={() => setEditing({ open: false, skill: null })}
          onSaved={() => setNonce((n) => n + 1)}
        />
      )}
    </>
  )
}
