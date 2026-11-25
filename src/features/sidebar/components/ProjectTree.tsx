import { Fragment, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PlusIcon } from '@/design/icons'
import type { ProjectGroup } from '@/shared/api/sessions'
import { shortcut } from '@/shared/utils/platform'
import { computeDropIndicatorIndex } from './projectDrag'
import { ProjectNode } from './ProjectNode'
import type { SessionStatus } from './SessionRow'
import { useSidebarDrag } from './useSidebarDrag'
import styles from './ProjectTree.module.css'

export interface ProjectTreeProps {
  projects: ProjectGroup[]
  activeSessionPath: string | null
  status: SessionStatus
  backgroundStatuses: ReadonlyMap<string, SessionStatus>
  pinnedProjects: string[]
  pinnedSessions: string[]
  sessionOrder: Record<string, string[]>
  onSelectProject: (cwd: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
  onTogglePinSession: (sessionPath: string) => void
  onDeleteSession: (sessionPath: string) => void
  onAddProject: () => void
  onReorder: (order: string[]) => void
  onReorderSessions: (cwd: string, order: string[]) => void
}

function ProjectGroupHeader({
  open,
  onToggle,
  onAddProject,
}: {
  open: boolean
  onToggle: () => void
  onAddProject: () => void
}) {
  return (
    <h3 className={styles.groupTitle}>
      <button
        type="button"
        className={styles.groupToggle}
        aria-expanded={open}
        onClick={onToggle}
      >
        项目
        {!open && <ChevronDown size={12} data-open={false} />}
      </button>
      <button
        type="button"
        className={styles.groupAction}
        onClick={onAddProject}
        aria-label="添加项目"
        title={`添加项目（${shortcut('O')}）`}
      >
        <PlusIcon size={16} />
      </button>
    </h3>
  )
}

/** 项目 → 会话两级列表。单个项目的展开/折叠由 ProjectNode 自己管 */
export function ProjectTree({
  projects,
  activeSessionPath,
  status,
  backgroundStatuses,
  pinnedProjects,
  pinnedSessions,
  sessionOrder,
  onSelectProject,
  onSelectSession,
  onTogglePinSession,
  onDeleteSession,
  onAddProject,
  onReorder,
  onReorderSessions,
}: ProjectTreeProps) {
  const [open, setOpen] = useState(true)
  const treeRef = useRef<HTMLDivElement>(null)
  const { drag, startDrag, onClickCapture } = useSidebarDrag(treeRef, {
    onReorder,
    onReorderSessions,
  })
  const projectCwds = projects.map((p) => p.cwd)
  const projectDrag = drag?.kind === 'project' ? drag : null
  const indicator = computeDropIndicatorIndex(
    projectCwds,
    projectDrag?.from ?? null,
    projectDrag?.over ?? null,
  )

  return (
    <div
      ref={treeRef}
      className={styles.tree}
      data-dragging-items={Boolean(drag)}
      onClickCapture={onClickCapture}
    >
      <ProjectGroupHeader
        open={open}
        onToggle={() => setOpen((value) => !value)}
        onAddProject={onAddProject}
      />
      {open && (
        <>
          {projects.map((project, index) => {
            const dragging = projectDrag?.from === project.cwd
            const isPinned = pinnedProjects.includes(project.cwd)
            const sessionDrag =
              drag?.kind === 'session' && drag.cwd === project.cwd ? drag : null
            return (
              <Fragment key={project.cwd}>
                {indicator === index && <div className={styles.dropIndicator} aria-hidden="true" />}
                <ProjectNode
                  project={project}
                  pinned={isPinned}
                  dragging={dragging}
                  dragOffsetY={dragging ? projectDrag.offsetY : 0}
                  onProjectPointerDown={(event) =>
                    startDrag(event, { kind: 'project', cwd: null, from: project.cwd, pinned: isPinned, items: projectCwds })
                  }
                  activeSessionPath={activeSessionPath}
                  status={status}
                  backgroundStatuses={backgroundStatuses}
                  pinnedSessions={pinnedSessions}
                  sessionOrder={sessionOrder[project.cwd] ?? []}
                  sessionDrag={sessionDrag}
                  onSessionPointerDown={(event, path, pinned, allPaths) =>
                    startDrag(event, { kind: 'session', cwd: project.cwd, from: path, pinned, items: allPaths })
                  }
                  onSelectProject={onSelectProject}
                  onSelectSession={onSelectSession}
                  onTogglePinSession={onTogglePinSession}
                  onDeleteSession={onDeleteSession}
                />
              </Fragment>
            )
          })}
          {indicator === projects.length && <div className={styles.dropIndicator} aria-hidden="true" />}
          {projects.length === 0 && <p className={styles.empty}>还没有项目，点右上角 + 选一个目录</p>}
        </>
      )}
    </div>
  )
}
