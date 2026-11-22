import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PlusIcon } from '@/design/icons'
import type { ProjectGroup } from '@/shared/api/sessions'
import type { SessionStatus } from './SessionRow'
import { ProjectNode } from './ProjectNode'
import styles from './ProjectTree.module.css'
import { shortcut } from '@/shared/utils/platform'
import { useSidebarDrag } from './useSidebarDrag'

export interface ProjectTreeProps {
  projects: ProjectGroup[]
  /** pi 眼下开着的那条会话，用于标出选中行 */
  activeSessionPath: string | null
  status: SessionStatus
  backgroundStatuses: ReadonlyMap<string, SessionStatus>
  pinnedSessions: string[]
  /** 每个项目内用户拖出来的会话顺序：cwd → 会话文件路径 */
  sessionOrder: Record<string, string[]>
  onSelectProject: (cwd: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
  onTogglePinSession: (sessionPath: string) => void
  onDeleteSession: (sessionPath: string) => void
  /** 打开系统目录选择器，把选中的目录加进列表 */
  onAddProject: () => void
  /** 拖拽结束后回报新的项目顺序（cwd 列表） */
  onReorder: (order: string[]) => void
  /** 拖拽结束后回报某个项目内的会话顺序 */
  onReorderSessions: (cwd: string, order: string[]) => void
}

/** 项目 → 会话两级列表。单个项目的展开/折叠由 ProjectNode 自己管 */
export function ProjectTree({
  projects,
  activeSessionPath,
  status,
  backgroundStatuses,
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
  const { projectDrag, setProjectDrag, sessionDrag, setSessionDrag, dropProject, dropSession } =
    useSidebarDrag({ onReorder, onReorderSessions })

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
          {/* Codex 只在折叠时露箭头（showCollapsedChevron），展开时是纯文字 */}
          {!open && <ChevronDown size={12} data-open={false} />}
        </button>

        {/* 对齐 Codex：添加入口在「项目」标题行右端，悬停才浮出来 */}
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
      {open &&
        projects.map((project) => (
          <ProjectNode
            key={project.cwd}
            project={project}
            draggable
            dragging={projectDrag?.from === project.cwd}
            dropTarget={
              projectDrag !== null &&
              projectDrag.over === project.cwd &&
              projectDrag.from !== project.cwd
            }
            onDragStart={() => setProjectDrag({ from: project.cwd, over: null })}
            onDragOver={() => {
              if (projectDrag && projectDrag.over !== project.cwd) {
                setProjectDrag({ ...projectDrag, over: project.cwd })
              }
            }}
            onDragEnd={() => setProjectDrag(null)}
            onDrop={() =>
              dropProject(
                projects.map((p) => p.cwd),
                project.cwd,
              )
            }
            activeSessionPath={activeSessionPath}
            status={status}
            backgroundStatuses={backgroundStatuses}
            pinnedSessions={pinnedSessions}
            sessionOrder={sessionOrder[project.cwd] ?? []}
            sessionDrag={sessionDrag?.cwd === project.cwd ? sessionDrag : null}
            onSessionDragStart={(path) =>
              setSessionDrag({ cwd: project.cwd, from: path, over: null })
            }
            onSessionDragOver={(path) => {
              if (sessionDrag?.cwd === project.cwd && sessionDrag.over !== path) {
                setSessionDrag({ ...sessionDrag, over: path })
              }
            }}
            onSessionDragEnd={() => setSessionDrag(null)}
            onSessionDrop={(visiblePaths, path) => dropSession(project.cwd, visiblePaths, path)}
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
