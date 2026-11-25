import { Cloud, GitBranch as GitBranchIcon, Plus } from 'lucide-react'
import { MenuEmpty, MenuGroupLabel, MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Skeleton } from '@/design/primitives/Skeleton'
import type { GitBranch } from '@/shared/api/git'
import styles from './BranchPicker.module.css'

export interface BranchListProps {
  loading: boolean
  switching: boolean
  localBranches: GitBranch[]
  remoteBranches: GitBranch[]
  currentBranch: string
  canCreate: boolean
  trimmed: string
  onPick: (item: GitBranch) => void
  onCreate: () => void
}

function BranchListSection({
  label,
  items,
  currentBranch,
  disabled,
  onSelect,
}: {
  label?: string
  items: GitBranch[]
  currentBranch: string
  disabled: boolean
  onSelect: (item: GitBranch) => void
}) {
  if (items.length === 0) return null
  return (
    <>
      {label && <MenuGroupLabel>{label}</MenuGroupLabel>}
      {items.map((item) => (
        <MenuItem
          key={`${item.remote ? 'r' : 'l'}:${item.name}`}
          icon={item.remote ? <Cloud size={15} /> : <GitBranchIcon size={16} />}
          selected={!item.remote && item.name === currentBranch}
          disabled={disabled}
          onClick={() => onSelect(item)}
        >
          {item.name}
        </MenuItem>
      ))}
    </>
  )
}

function CreateBranchAction({
  visible,
  divided,
  disabled,
  name,
  onCreate,
}: {
  visible: boolean
  divided: boolean
  disabled: boolean
  name: string
  onCreate: () => void
}) {
  if (!visible) return null
  return (
    <>
      {divided && <MenuSeparator />}
      <MenuItem icon={<Plus size={16} />} disabled={disabled} onClick={onCreate}>
        创建并检出 {name}
      </MenuItem>
    </>
  )
}

/** 分支列表主体：按本地 / 远程分组展示，并支持新建并检出 */
export function BranchList({
  loading,
  switching,
  localBranches,
  remoteBranches,
  currentBranch,
  canCreate,
  trimmed,
  onPick,
  onCreate,
}: BranchListProps) {
  if (loading) {
    return (
      <div className={styles.loading}>
        <Skeleton width="60%" height="14px" />
        <Skeleton width="45%" height="14px" />
      </div>
    )
  }
  const hasLocal = localBranches.length > 0
  const hasRemote = remoteBranches.length > 0
  const hasAny = hasLocal || hasRemote
  if (!hasAny && !canCreate) return <MenuEmpty>没有匹配的分支</MenuEmpty>

  return (
    <>
      <BranchListSection
        label={hasRemote ? '本地' : undefined}
        items={localBranches}
        currentBranch={currentBranch}
        disabled={switching}
        onSelect={onPick}
      />
      {hasLocal && hasRemote && <MenuSeparator />}
      <BranchListSection
        label={hasRemote ? '远程' : undefined}
        items={remoteBranches}
        currentBranch={currentBranch}
        disabled={switching}
        onSelect={onPick}
      />
      <CreateBranchAction
        visible={canCreate}
        divided={hasAny}
        disabled={switching}
        name={trimmed}
        onCreate={onCreate}
      />
    </>
  )
}
