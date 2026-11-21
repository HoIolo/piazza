import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { FolderIcon, FolderOpenIcon } from '@/design/icons'
import type { ProjectGroup } from '@/shared/api/sessions'
import { dragHandlers } from './projectDrag'
import { ProjectRowActions, SessionList } from './ProjectRowParts'
import type { SessionStatus } from './SessionRow'
import styles from './ProjectTree.module.css'

/** 初始露出及每次点击「展开显示」递增的会话条数（对齐 Codex：每次多展开 5 个） */
const PAGE_SIZE = 5

export interface ProjectNodeProps {
  project: ProjectGroup
  /** 是否允许拖动排序（侧栏里始终为真；@提及等只读场景不传） */
  draggable?: boolean
  /** 正在被拖动 */
  dragging?: boolean
  /** 拖动经过它、松手会落在这里 */
  dropTarget?: boolean
  onDragStart?: () => void
  onDragOver?: () => void
  onDragEnd?: () => void
  onDrop?: () => void
  activeSessionPath: string | null
  status: SessionStatus
  backgroundStatuses: ReadonlyMap<string, SessionStatus>
  /** 置顶的会话路径 */
  pinnedSessions: string[]
  onSelectProject: (cwd: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
  onTogglePinSession: (sessionPath: string) => void
  onDeleteSession: (sessionPath: string) => void
}

export function ProjectNode({
  project,
  draggable = false,
  dragging = false,
  dropTarget = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  activeSessionPath,
  status,
  backgroundStatuses,
  pinnedSessions,
  onSelectProject,
  onSelectSession,
  onTogglePinSession,
  onDeleteSession,
}: ProjectNodeProps) {
  const [open, setOpen] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // 折叠项目或重新展开时，重置内部展示数量为 5 个
  const toggleOpen = () => {
    setOpen((v) => !v)
    setVisibleCount(PAGE_SIZE)
  }

  // 置顶的提前，其余保持后端按最近修改排好的顺序（sort 是稳定的）
  const ordered = [...project.sessions].sort(
    (a, b) => Number(pinnedSessions.includes(b.path)) - Number(pinnedSessions.includes(a.path)),
  )
  const sessions = ordered.slice(0, visibleCount)
  const total = ordered.length
  const hasMore = total > visibleCount

  return (
    <div className={styles.project} data-open={open}>
      <div
        className={styles.projectRow}
        data-open={open}
        data-dragging={dragging}
        data-drop-target={dropTarget}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        {...dragHandlers(project.cwd, { draggable, onDragStart, onDragOver, onDragEnd, onDrop })}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
          e.preventDefault()
          toggleOpen()
        }}
        title={project.cwd}
      >
        <span className={styles.projectIcon}>
          {open ? (
            <FolderOpenIcon size={16} className={styles.folderIcon} />
          ) : (
            <FolderIcon size={16} className={styles.folderIcon} />
          )}
          <ChevronRight size={14} className={styles.chevron} data-open={open} />
        </span>
        <span className={styles.projectName}>{project.name}</span>

        <ProjectRowActions cwd={project.cwd} onNewSession={() => onSelectProject(project.cwd)} />
      </div>

      {open && (
        <SessionList
          sessions={sessions}
          total={total}
          hasMore={hasMore}
          cwd={project.cwd}
          activeSessionPath={activeSessionPath}
          status={status}
          backgroundStatuses={backgroundStatuses}
          pinnedSessions={pinnedSessions}
          onSelectSession={onSelectSession}
          onTogglePinSession={onTogglePinSession}
          onDeleteSession={onDeleteSession}
          onToggleMore={() => setVisibleCount((c) => (hasMore ? c + PAGE_SIZE : PAGE_SIZE))}
        />
      )}
    </div>
  )
}
