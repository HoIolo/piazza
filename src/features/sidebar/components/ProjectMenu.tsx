import { useState } from 'react'
import { Folder, MoreHorizontal, Pin, PinOff, Split, X } from 'lucide-react'
import { MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { addGitWorktree } from '@/shared/api/git'
import { openPathWith } from '@/shared/api/pi'
import { errorMessage } from '@/shared/utils/error'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { useAppStore } from '@/store/app.store'
import styles from './ProjectMenu.module.css'

export interface ProjectMenuProps {
  cwd: string
}

/** 工作树创建行：菜单里就地输入分支名，不另开对话框 */
function WorktreeRow({
  branch,
  onChange,
  onConfirm,
}: {
  branch: string
  onChange: (value: string) => void
  onConfirm: () => void
}) {
  const ime = useImeGuard()

  return (
    <div className={styles.createRow}>
      <input
        className={styles.input}
        placeholder="新分支名"
        value={branch}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !ime.isComposing(e) && onConfirm()}
        {...ime.bind}
      />
      <button
        type="button"
        className={styles.confirm}
        disabled={!branch.trim()}
        onClick={onConfirm}
      >
        创建
      </button>
    </div>
  )
}

/**
 * 项目行的「…」菜单。
 *
 * Codex 原版还有「编辑项目」与「归档聊天」：pi 没有项目级配置，也没有归档的概念，
 * 摆上去就是点了没反应的死按钮，因此不列入。「移除」也只是从侧栏隐藏——
 * 侧栏是扫 ~/.pi/agent/sessions 得来的，真删就是删用户的会话记录，不能这么干。
 */
export function ProjectMenu({ cwd }: ProjectMenuProps) {
  const pinned = useAppStore((s) => s.pinnedProjects.includes(cwd))
  const togglePin = useAppStore((s) => s.togglePinnedProject)
  const hide = useAppStore((s) => s.hideProject)
  const selectProject = useAppStore((s) => s.selectProject)
  const refreshGit = useAppStore((s) => s.refreshGit)

  const [creating, setCreating] = useState(false)
  const [branch, setBranch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createWorktree = async (close: () => void) => {
    const name = branch.trim()
    if (!name) return
    try {
      const path = await addGitWorktree(cwd, name)
      refreshGit()
      selectProject(path)
      setBranch('')
      setCreating(false)
      close()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Popover
      side="bottom"
      align="start"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.trigger}
          data-open={open}
          onClick={(e) => {
            // 行本身负责展开/折叠，点菜单不该顺带把项目折起来
            e.stopPropagation()
            setError(null)
            setCreating(false)
            toggle()
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="项目菜单"
        >
          <MoreHorizontal size={16} />
        </button>
      )}
    >
      {(close) => (
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
          <MenuItem
            icon={pinned ? <PinOff size={16} /> : <Pin size={16} />}
            onClick={() => {
              togglePin(cwd)
              close()
            }}
          >
            {pinned ? '取消置顶' : '置顶项目'}
          </MenuItem>

          <MenuItem
            icon={<Folder size={16} />}
            onClick={() => {
              void openPathWith('', cwd)
              close()
            }}
          >
            在 Finder 中显示
          </MenuItem>

          {creating ? (
            <WorktreeRow
              branch={branch}
              onChange={setBranch}
              onConfirm={() => void createWorktree(close)}
            />
          ) : (
            <MenuItem icon={<Split size={16} />} onClick={() => setCreating(true)}>
              创建永久工作树
            </MenuItem>
          )}

          <MenuSeparator />

          <MenuItem
            icon={<X size={16} />}
            onClick={() => {
              hide(cwd)
              close()
            }}
          >
            从列表移除
          </MenuItem>

          {error && <div className={styles.error}>{error}</div>}
        </div>
      )}
    </Popover>
  )
}
