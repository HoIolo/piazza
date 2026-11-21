import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PlusIcon } from '@/design/icons'
import type { ProjectGroup } from '@/shared/api/sessions'
import type { SessionStatus } from './SessionRow'
import { ProjectNode } from './ProjectNode'
import styles from './ProjectTree.module.css'

export interface ProjectTreeProps {
  projects: ProjectGroup[]
  /** pi 眼下开着的那条会话，用于标出选中行 */
  activeSessionPath: string | null
  status: SessionStatus
  backgroundStatuses: ReadonlyMap<string, SessionStatus>
  pinnedSessions: string[]
  onSelectProject: (cwd: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
  onTogglePinSession: (sessionPath: string) => void
  onDeleteSession: (sessionPath: string) => void
  /** 打开系统目录选择器，把选中的目录加进列表 */
  onAddProject: () => void
}

/** 项目 → 会话两级列表。单个项目的展开/折叠由 ProjectNode 自己管 */
export function ProjectTree({
  projects,
  activeSessionPath,
  status,
  backgroundStatuses,
  pinnedSessions,
  onSelectProject,
  onSelectSession,
  onTogglePinSession,
  onDeleteSession,
  onAddProject,
}: ProjectTreeProps) {
  const [open, setOpen] = useState(true)

  return (
    <div className={styles.tree}>
      <h3 className={styles.groupTitle}>
        <button
          type="button"
          className={styles.groupToggle}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          项目
          <ChevronDown size={12} data-open={open} />
        </button>

        {/* 对齐 Codex：添加入口在「项目」标题行右端，悬停才浮出来 */}
        <button
          type="button"
          className={styles.groupAction}
          onClick={onAddProject}
          aria-label="添加项目"
          title="添加项目（⌘O）"
        >
          <PlusIcon size={16} />
        </button>
      </h3>
      {open &&
        projects.map((project) => (
          <ProjectNode
            key={project.cwd}
            project={project}
            activeSessionPath={activeSessionPath}
            status={status}
            backgroundStatuses={backgroundStatuses}
            pinnedSessions={pinnedSessions}
            onSelectProject={onSelectProject}
            onSelectSession={onSelectSession}
            onTogglePinSession={onTogglePinSession}
            onDeleteSession={onDeleteSession}
          />
        ))}

      {open && projects.length === 0 && (
        <p className={styles.empty}>还没有项目，点右上角 + 选一个目录</p>
      )}
    </div>
  )
}
