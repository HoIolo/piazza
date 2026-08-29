import { useCallback, useEffect, useState } from 'react'
import { GitBranch, Monitor, Plus } from 'lucide-react'
import { MenuGroupLabel, MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { addGitWorktree, listGitWorktrees, type Worktree } from '@/shared/api/git'
import { errorMessage } from '@/shared/utils/error'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { basename } from '@/shared/utils/path'
import { useAppStore } from '@/store/app.store'
import styles from './WorkModePicker.module.css'

/** 拉取 worktree 列表；非 git 目录返回空 */
function useWorktrees(cwd: string | null, enabled: boolean) {
  const [items, setItems] = useState<Worktree[]>([])
  const nonce = useAppStore((s) => s.gitNonce)

  useEffect(() => {
    if (!enabled || !cwd) return
    let cancelled = false
    listGitWorktrees(cwd)
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [cwd, enabled, nonce])

  return items
}

/**
 * 工作模式，占据 Codex「本地 / 新工作树 / 关联 Codex web」的位置。
 *
 * pi 只在本地运行，没有云端可连，因此云端相关项不做；
 * 换成 git worktree——它才是本地并行开几条线的实际手段。
 */
export function WorkModePicker() {
  const cwd = useAppStore((s) => s.currentCwd)
  const selectProject = useAppStore((s) => s.selectProject)
  const refreshGit = useAppStore((s) => s.refreshGit)
  const [opened, setOpened] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ime = useImeGuard()
  const worktrees = useWorktrees(cwd, opened)

  const current = worktrees.find((w) => w.path === cwd)
  const label = current && !current.isMain ? basename(current.path) : '本地'

  const create = useCallback(
    async (close: () => void) => {
      const branch = name.trim()
      if (!cwd || !branch) return
      try {
        const path = await addGitWorktree(cwd, branch)
        refreshGit()
        selectProject(path)
        setName('')
        close()
      } catch (e) {
        setError(errorMessage(e))
      }
    },
    [cwd, name, refreshGit, selectProject],
  )

  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.trigger}
          data-open={open}
          onClick={() => {
            setOpened(true)
            setError(null)
            toggle()
          }}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Monitor size={15} className={styles.icon} />
          {label}
        </button>
      )}
    >
      {(close) => (
        <div className={styles.panel}>
          <MenuGroupLabel>工作模式</MenuGroupLabel>
          {worktrees.map((tree) => (
            <MenuItem
              key={tree.path}
              icon={tree.isMain ? <Monitor size={16} /> : <GitBranch size={16} />}
              selected={tree.path === cwd}
              hint={tree.branch}
              onClick={() => {
                selectProject(tree.path)
                close()
              }}
            >
              {tree.isMain ? '本地' : basename(tree.path)}
            </MenuItem>
          ))}

          <MenuSeparator />

          {creating ? (
            <div className={styles.createRow}>
              <input
                className={styles.input}
                placeholder="新分支名"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !ime.isComposing(e) && void create(close)}
                {...ime.bind}
              />
              <button
                type="button"
                className={styles.confirm}
                disabled={!name.trim()}
                onClick={() => void create(close)}
              >
                创建
              </button>
            </div>
          ) : (
            <MenuItem icon={<Plus size={16} />} onClick={() => setCreating(true)}>
              新建工作树
            </MenuItem>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>
      )}
    </Popover>
  )
}
