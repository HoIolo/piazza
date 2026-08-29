import type { ProjectGroup } from '@/shared/api/sessions'
import { ProjectNode } from './ProjectNode'
import styles from './ProjectTree.module.css'

export interface ProjectTreeProps {
  projects: ProjectGroup[]
  currentCwd: string | null
  /** pi 眼下开着的那条会话，用于标出选中行 */
  activeSessionPath: string | null
  /** 当前会话是否正在生成 */
  running?: boolean
  /** 当前会话是否在等待用户回答 */
  awaitingInput?: boolean
  onSelectProject: (cwd: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
}

/** 项目 → 会话两级列表。单个项目的展开/折叠由 ProjectNode 自己管 */
export function ProjectTree({
  projects,
  currentCwd,
  activeSessionPath,
  running = false,
  awaitingInput = false,
  onSelectProject,
  onSelectSession,
}: ProjectTreeProps) {
  return (
    <div className={styles.tree}>
      <h3 className={styles.groupTitle}>项目</h3>
      {projects.map((project) => (
        <ProjectNode
          key={project.cwd}
          project={project}
          currentCwd={currentCwd}
          activeSessionPath={activeSessionPath}
          running={running}
          awaitingInput={awaitingInput}
          onSelectProject={onSelectProject}
          onSelectSession={onSelectSession}
        />
      ))}
    </div>
  )
}
