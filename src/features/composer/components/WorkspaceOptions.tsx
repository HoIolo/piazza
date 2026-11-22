import { useState } from 'react'
import { Ellipsis, GitFork } from 'lucide-react'
import { MenuGroupLabel, MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { BranchPicker } from '@/shared/components/BranchPicker'
import { addGitWorktree } from '@/shared/api/git'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import styles from './WorkspaceOptions.module.css'

function WorktreeOption({ close }: { close: () => void }) {
  const cwd = useAppStore((s) => s.currentCwd)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ime = useImeGuard()

  async function create() {
    if (!cwd || !name.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const path = await addGitWorktree(cwd, name.trim())
      const app = useAppStore.getState()
      app.refreshGit()
      if (app.currentCwd === cwd) app.selectProject(path)
      close()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  if (!creating) {
    return (
      <MenuItem icon={<GitFork size={16} />} onClick={() => setCreating(true)}>
        新建工作树
      </MenuItem>
    )
  }

  return (
    <div className={styles.create}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <input
          aria-label="新工作树分支名"
          placeholder="新分支名"
          value={name}
          autoFocus
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ime.isComposing(e)) e.preventDefault()
          }}
          {...ime.bind}
        />
        <button type="submit" disabled={busy || !name.trim()}>
          {busy ? '正在创建…' : '创建'}
        </button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function WorkspaceOptions({ branch }: { branch: string }) {
  return (
    <Popover
      overflow="visible"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.trigger}
          onClick={toggle}
          title="更多设置"
          aria-label="更多设置"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Ellipsis size={16} />
        </button>
      )}
    >
      {(close) => (
        <div className={styles.panel}>
          <MenuGroupLabel>更多设置</MenuGroupLabel>
          <WorktreeOption close={close} />
          <MenuSeparator />
          <BranchPicker branch={branch} menuRow />
        </div>
      )}
    </Popover>
  )
}
