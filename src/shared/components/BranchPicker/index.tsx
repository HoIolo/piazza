import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, GitBranch, Plus, Search } from 'lucide-react'
import { MenuEmpty, MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover, type PopoverProps } from '@/design/primitives/Popover'
import { Skeleton } from '@/design/primitives/Skeleton'
import { checkoutGitBranch, listGitBranches } from '@/shared/api/git'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import styles from './BranchPicker.module.css'

/** 拉取本地分支列表。仅在浮层打开后调用，避免每次渲染都 spawn git */
function useBranches(cwd: string | null, enabled: boolean) {
  const [branches, setBranches] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const nonce = useAppStore((s) => s.gitNonce)

  useEffect(() => {
    if (!enabled || !cwd) return
    let cancelled = false

    listGitBranches(cwd)
      .then((list) => {
        if (!cancelled) setBranches(list)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [cwd, enabled, nonce])

  return { branches, loading: !loaded }
}

export interface BranchPickerProps {
  branch: string
  menuRow?: boolean
  /** 弹出方向。默认向上，贴着窗口上缘时要传 bottom */
  side?: PopoverProps['side']
}

/** 分支选择器。切换会改动工作区，失败时把 git 的原始错误显示出来 */
export function BranchPicker({ branch, side, menuRow = false }: BranchPickerProps) {
  const cwd = useAppStore((s) => s.currentCwd)
  const refreshGit = useAppStore((s) => s.refreshGit)
  const [opened, setOpened] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { branches, loading } = useBranches(cwd, opened)

  const trimmed = keyword.trim()
  const filtered = branches.filter((b) => b.toLowerCase().includes(trimmed.toLowerCase()))
  const canCreate = trimmed.length > 0 && !branches.includes(trimmed)

  const switchTo = useCallback(
    async (name: string, create: boolean, close: () => void) => {
      if (!cwd) return
      try {
        await checkoutGitBranch(cwd, name, create)
        refreshGit()
        close()
      } catch (e) {
        setError(errorMessage(e))
      }
    },
    [cwd, refreshGit],
  )

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
            setError(null)
            toggle()
          }}
          aria-label={menuRow ? `分支（${branch}）` : undefined}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <GitBranch size={15} className={styles.icon} />
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
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.list}>
            {loading ? (
              <div className={styles.loading}>
                <Skeleton width="60%" height="14px" />
                <Skeleton width="45%" height="14px" />
              </div>
            ) : filtered.length === 0 && !canCreate ? (
              <MenuEmpty>没有匹配的分支</MenuEmpty>
            ) : (
              filtered.map((name) => (
                <MenuItem
                  key={name}
                  icon={<GitBranch size={16} />}
                  selected={name === branch}
                  onClick={() => void switchTo(name, false, close)}
                >
                  {name}
                </MenuItem>
              ))
            )}

            {canCreate && (
              <>
                <MenuSeparator />
                <MenuItem
                  icon={<Plus size={16} />}
                  onClick={() => void switchTo(trimmed, true, close)}
                >
                  创建并检出 {trimmed}
                </MenuItem>
              </>
            )}
          </div>
        </div>
      )}
    </Popover>
  )
}
