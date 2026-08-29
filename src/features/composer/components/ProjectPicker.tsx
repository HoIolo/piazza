import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { Folder, FolderPlus, Search } from 'lucide-react'
import { MenuEmpty, MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { Skeleton } from '@/design/primitives/Skeleton'
import { useProjectsStore } from '@/store/projects.store'
import { useAppStore } from '@/store/app.store'
import styles from './ProjectPicker.module.css'

/**
 * 项目选择器，对应 Codex 上下文条最左侧的项目按钮。
 *
 * 项目来自已扫描的会话目录；「打开其他项目」用系统目录选择器指定任意路径，
 * 覆盖了 Codex「新建项目」的实际用途。
 */
export function ProjectPicker({ projectName }: { projectName: string }) {
  const [keyword, setKeyword] = useState('')
  const projects = useProjectsStore((s) => s.projects)
  const loading = useProjectsStore((s) => s.loading)
  const currentCwd = useAppStore((s) => s.currentCwd)
  const selectProject = useAppStore((s) => s.selectProject)

  const filtered = projects.filter((p) =>
    `${p.name} ${p.cwd}`.toLowerCase().includes(keyword.trim().toLowerCase()),
  )

  const pickDirectory = async (close: () => void) => {
    close()
    const picked = await open({ directory: true, defaultPath: currentCwd ?? undefined })
    if (typeof picked === 'string') selectProject(picked)
  }

  return (
    <Popover
      trigger={({ toggle, open: isOpen }) => (
        <button
          type="button"
          className={styles.trigger}
          data-open={isOpen}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={isOpen}
        >
          <Folder size={15} className={styles.icon} />
          {projectName}
        </button>
      )}
    >
      {(close) => (
        <div className={styles.panel}>
          <div className={styles.searchRow}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.search}
              placeholder="搜索项目"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              autoFocus
            />
          </div>

          {loading ? (
            <div className={styles.loading}>
              <Skeleton width="70%" height="14px" />
              <Skeleton width="52%" height="14px" />
            </div>
          ) : filtered.length === 0 ? (
            <MenuEmpty>没有匹配的项目</MenuEmpty>
          ) : (
            filtered.map((project) => (
              <MenuItem
                key={project.cwd}
                icon={<Folder size={16} />}
                selected={project.cwd === currentCwd}
                onClick={() => {
                  selectProject(project.cwd)
                  close()
                }}
              >
                {project.name}
              </MenuItem>
            ))
          )}

          <MenuSeparator />
          <MenuItem icon={<FolderPlus size={16} />} onClick={() => void pickDirectory(close)}>
            打开其他项目
          </MenuItem>
        </div>
      )}
    </Popover>
  )
}
