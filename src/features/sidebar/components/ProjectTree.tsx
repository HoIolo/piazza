import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { moveItem } from '../projectOrder'
import { PlusIcon } from '@/design/icons'
import type { ProjectGroup } from '@/shared/api/sessions'
import type { SessionStatus } from './SessionRow'
import { ProjectNode } from './ProjectNode'
import styles from './ProjectTree.module.css'
import { shortcut } from '@/shared/utils/platform'

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
  /** 拖拽结束后回报新的项目顺序（cwd 列表） */
  onReorder: (order: string[]) => void
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
  onReorder,
}: ProjectTreeProps) {
  const [open, setOpen] = useState(true)
  /** 正在拖的项目 cwd 与拖到它上面的目标 cwd */
  const [drag, setDrag] = useState<{ from: string; over: string | null } | null>(null)

  /*
   * 拖完把 from 挪到 to 的位置并回报。
   *
   * 传的是整份 cwd 顺序而不是「谁插到谁前面」：只记最终顺序，
   * 将来加了新项目也能算出它该落在哪，不必回放一串相对操作。
   */
  const drop = (to: string) => {
    const from = drag?.from
    setDrag(null)
    if (!from || from === to) return
    const cwds = projects.map((p) => p.cwd)
    const next = moveItem(cwds, cwds.indexOf(from), cwds.indexOf(to))
    if (next !== cwds) onReorder(next)
  }

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
            dragging={drag?.from === project.cwd}
            dropTarget={drag !== null && drag.over === project.cwd && drag.from !== project.cwd}
            onDragStart={() => setDrag({ from: project.cwd, over: null })}
            onDragOver={() => {
              if (drag && drag.over !== project.cwd) setDrag({ ...drag, over: project.cwd })
            }}
            onDragEnd={() => setDrag(null)}
            onDrop={() => drop(project.cwd)}
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
