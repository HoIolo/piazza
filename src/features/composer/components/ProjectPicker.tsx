import { useState } from 'react'
import { Folder, FolderPlus, Search } from 'lucide-react'
import { MenuEmpty, MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { Skeleton } from '@/design/primitives/Skeleton'
import { addProject } from '@/shared/utils/addProject'
import { useProjectsStore } from '@/store/projects.store'
import { useAppStore } from '@/store/app.store'
import styles from './ProjectPicker.module.css'

/**
 * 项目选择器，对应 Codex 上下文条最左侧的项目按钮。
 *
 * 项目来自已扫描的会话目录，加上手动添加过的目录；「添加项目」走与
 * 侧栏「+」、⌘O 同一个入口，选完就切过去。
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
          <span>{projectName}</span>
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

          <div className={styles.list}>
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
          </div>

          <MenuSeparator />
          <MenuItem
            icon={<FolderPlus size={16} />}
            onClick={() => {
              close()
              void addProject()
            }}
          >
            添加项目
          </MenuItem>
        </div>
      )}
    </Popover>
  )
}
