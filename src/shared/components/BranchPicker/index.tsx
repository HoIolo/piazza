import { useState } from 'react'
import { ChevronRight, GitBranch as GitBranchIcon, RefreshCw, Search } from 'lucide-react'
import { Popover, type PopoverProps } from '@/design/primitives/Popover'
import { useAppStore } from '@/store/app.store'
import { BranchList } from './BranchList'
import { useBranches } from './useBranches'
import styles from './BranchPicker.module.css'

export interface BranchPickerProps {
  branch: string
  menuRow?: boolean
  /** 弹出方向。默认向上，贴着窗口上缘时要传 bottom */
  side?: PopoverProps['side']
}

/** 分支选择器：同时展示本地与远程分支，支持搜索、一键拉取远程与检出跟踪分支 */
export function BranchPicker({ branch, side, menuRow = false }: BranchPickerProps) {
  const cwd = useAppStore((s) => s.currentCwd)
  const [opened, setOpened] = useState(false)
  const [keyword, setKeyword] = useState('')
  const { branches, loading, fetching, switching, error, clearError, syncRemotes, switchTo } =
    useBranches(cwd, opened)

  const trimmed = keyword.trim()
  const needle = trimmed.toLowerCase()
  const filtered = needle ? branches.filter((b) => b.name.toLowerCase().includes(needle)) : branches
  const localBranches = filtered.filter((b) => !b.remote)
  const remoteBranches = filtered.filter((b) => b.remote)
  const canCreate = trimmed.length > 0 && !branches.some((b) => !b.remote && b.name === trimmed)

  return (
    <Popover
      side={menuRow ? 'right' : side}
      className={menuRow ? styles.menuAnchor : undefined}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={menuRow ? styles.menuRow : styles.trigger}
          data-open={open}
          onClick={() => {
            setOpened(true)
            setKeyword('')
            clearError()
            toggle()
          }}
          aria-label={menuRow ? `分支（${branch}）` : undefined}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <GitBranchIcon size={15} className={styles.icon} />
          {menuRow && <span className={styles.menuLabel}>分支</span>}
          <span>{branch}</span>
          {menuRow && <ChevronRight size={14} />}
        </button>
      )}
    >
      {(close) => (
        <div className={styles.panel}>
          <div className={styles.searchRow}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.search}
              placeholder="搜索或新建分支"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => void syncRemotes()}
              disabled={fetching}
              aria-label="拉取远程分支"
              title="拉取远程分支"
            >
              <RefreshCw size={14} className={fetching ? styles.spin : undefined} />
            </button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.list}>
            <BranchList
              loading={loading}
              switching={switching}
              localBranches={localBranches}
              remoteBranches={remoteBranches}
              currentBranch={branch}
              canCreate={canCreate}
              trimmed={trimmed}
              onPick={(item) => void switchTo(item.name, { remote: item.remote }, close)}
              onCreate={() => void switchTo(trimmed, { create: true }, close)}
            />
          </div>
        </div>
      )}
    </Popover>
  )
}
