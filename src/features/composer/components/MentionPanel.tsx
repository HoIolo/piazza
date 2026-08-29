import { FileCode, MessageSquare, Paperclip, Search, Sparkles } from 'lucide-react'
import { MenuEmpty, MenuGroupLabel, MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import type { MentionItem } from '../hooks/useMentionItems'
import styles from './MentionPanel.module.css'

const ICONS = {
  file: FileCode,
  skill: Sparkles,
  session: MessageSquare,
} as const

export interface MentionPanelProps {
  groups: { files: MentionItem[]; skills: MentionItem[]; sessions: MentionItem[] }
  query: string
  /** 提供时面板自带搜索框；@ 触发时关键词来自输入框，故不提供 */
  onQueryChange?: (value: string) => void
  onPick: (item: MentionItem) => void
  /** 打开系统文件选择器 */
  onPickFromDisk?: (directory: boolean) => void
}

function Section({
  label,
  items,
  onPick,
}: {
  label: string
  items: MentionItem[]
  onPick: (item: MentionItem) => void
}) {
  if (items.length === 0) return null
  const Icon = ICONS[items[0].kind]

  return (
    <>
      <MenuGroupLabel>{label}</MenuGroupLabel>
      {items.map((item) => (
        <MenuItem
          key={item.id}
          icon={<Icon size={16} />}
          hint={item.hint}
          onClick={() => onPick(item)}
        >
          {item.label}
        </MenuItem>
      ))}
    </>
  )
}

/**
 * 提及面板。「+」按钮与输入 @ 打开的是同一个面板、同一个位置——
 * 两条入口找的是同一批东西，分成两处只会让人记两遍。
 */
export function MentionPanel({
  groups,
  query,
  onQueryChange,
  onPick,
  onPickFromDisk,
}: MentionPanelProps) {
  const empty =
    groups.files.length === 0 && groups.skills.length === 0 && groups.sessions.length === 0

  return (
    <div className={styles.panel}>
      {onQueryChange && (
        <div className={styles.searchRow}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.search}
            placeholder="搜索文件、技能或会话"
            value={query}
            autoFocus
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
      )}

      <div className={styles.list}>
        {onPickFromDisk && (
          <>
            <MenuGroupLabel>添加</MenuGroupLabel>
            <MenuItem icon={<Paperclip size={16} />} onClick={() => onPickFromDisk(false)}>
              文件和文件夹
            </MenuItem>
            <MenuSeparator />
          </>
        )}

        <Section label="技能与提示词" items={groups.skills} onPick={onPick} />
        <Section label="文件" items={groups.files} onPick={onPick} />
        <Section label="会话记录" items={groups.sessions} onPick={onPick} />
        {empty && !onPickFromDisk && <MenuEmpty>没有匹配项</MenuEmpty>}
      </div>
    </div>
  )
}
