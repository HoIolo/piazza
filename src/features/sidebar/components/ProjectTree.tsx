import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ProjectGroup } from '@/shared/api/sessions'
import type { SessionStatus } from './SessionRow'
import { ProjectNode } from './ProjectNode'
import styles from './ProjectTree.module.css'

export interface ProjectTreeProps {
  projects: ProjectGroup[]
  /** pi 眼下开着的那条会话，用于标出选中行 */
  activeSessionPath: string | null
  status: SessionStatus
  pinnedSessions: string[]
  onSelectProject: (cwd: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
  onTogglePinSession: (sessionPath: string) => void
  onDeleteSession: (sessionPath: string) => void
}

/** 项目 → 会话两级列表。单个项目的展开/折叠由 ProjectNode 自己管 */
export function ProjectTree({
  projects,
  activeSessionPath,
  status,
  pinnedSessions,
  onSelectProject,
  onSelectSession,
  onTogglePinSession,
  onDeleteSession,
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
      </h3>
      {open &&
        projects.map((project) => (
          <ProjectNode
            key={project.cwd}
            project={project}
            activeSessionPath={activeSessionPath}
            status={status}
            pinnedSessions={pinnedSessions}
            onSelectProject={onSelectProject}
            onSelectSession={onSelectSession}
            onTogglePinSession={onTogglePinSession}
            onDeleteSession={onDeleteSession}
          />
        ))}
    </div>
  )
}
