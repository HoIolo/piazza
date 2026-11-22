import { useEffect, useState } from 'react'
import { GitBranch, Monitor } from 'lucide-react'
import { MenuGroupLabel, MenuItem } from '@/design/primitives/MenuList'
import { Popover, type PopoverProps } from '@/design/primitives/Popover'
import { listGitWorktrees, type Worktree } from '@/shared/api/git'
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
export interface WorkModePickerProps {
  /** 弹出方向。默认向上，贴着窗口上缘时要传 bottom */
  side?: PopoverProps['side']
  localLabel?: string
}

export function WorkModePicker({ side, localLabel = '本地' }: WorkModePickerProps) {
  const cwd = useAppStore((s) => s.currentCwd)
  const selectProject = useAppStore((s) => s.selectProject)
  const [opened, setOpened] = useState(false)
  const worktrees = useWorktrees(cwd, opened)

  const current = worktrees.find((w) => w.path === cwd)
  const label = current && !current.isMain ? basename(current.path) : localLabel

  return (
    <Popover
      side={side}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.trigger}
          data-open={open}
          onClick={() => {
            setOpened(true)
            toggle()
          }}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Monitor size={15} className={styles.icon} />
          <span>{label}</span>
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
        </div>
      )}
    </Popover>
  )
}
