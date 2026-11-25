import { useState, type PointerEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { FolderIcon, FolderOpenIcon } from '@/design/icons'
import type { ProjectGroup } from '@/shared/api/sessions'
import { applySessionOrder } from '../projectOrder'
import { dragRowStyle } from './projectDrag'
import { ProjectRowActions, SessionList } from './ProjectRowParts'
import type { SessionStatus } from './SessionRow'
import type { ActiveSidebarDrag } from './useSidebarDrag'
import styles from './ProjectTree.module.css'

/** 初始露出及每次点击「展开显示」递增的会话条数（对齐 Codex：每次多展开 5 个） */
const PAGE_SIZE = 5

export interface ProjectNodeProps {
  project: ProjectGroup
  pinned?: boolean
  /** 正在被拖动 */
  dragging?: boolean
  /** 拖动中的纵向位移（px） */
  dragOffsetY?: number
  onProjectPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  activeSessionPath: string | null
  status: SessionStatus
  backgroundStatuses: ReadonlyMap<string, SessionStatus>
  /** 置顶的会话路径 */
  pinnedSessions: string[]
  /** 这个项目内用户拖出来的会话顺序 */
  sessionOrder: string[]
  /** 项目内正在拖的会话（只在拖的是本项目时才非空） */
  sessionDrag: ActiveSidebarDrag | null
  onSessionPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    path: string,
    pinned: boolean,
    allPaths: string[],
  ) => void
  onSelectProject: (cwd: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
  onTogglePinSession: (sessionPath: string) => void
  onDeleteSession: (sessionPath: string) => void
}

export function ProjectNode({
  project,
  pinned = false,
  dragging = false,
  dragOffsetY = 0,
  onProjectPointerDown,
  activeSessionPath,
  status,
  backgroundStatuses,
  pinnedSessions,
  sessionOrder,
  sessionDrag,
  onSessionPointerDown,
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

  /*
   * 顺序：先按用户拖出来的（没拖过则按创建时间倒序），再把置顶的整组提前。
   * 置顶放在最后一步：置顶区内部仍沿用拖出来的相对顺序。
   */
  const ordered = applySessionOrder(project.sessions, sessionOrder, (s) => s.createdMs).sort(
    (a, b) => Number(pinnedSessions.includes(b.path)) - Number(pinnedSessions.includes(a.path)),
  )
  const allOrderedPaths = ordered.map((s) => s.path)
  const sessions = ordered.slice(0, visibleCount)
  const total = ordered.length
  const hasMore = total > visibleCount

  return (
    <div
      className={styles.project}
      data-project-node={project.cwd}
      data-pinned={pinned}
      data-open={open}
      data-dragging={dragging}
      style={dragRowStyle(dragging, dragOffsetY)}
    >
      <div
        className={styles.projectRow}
        data-project-cwd={project.cwd}
        data-open={open}
        data-dragging={dragging}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onPointerDown={onProjectPointerDown}
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
          allOrderedPaths={allOrderedPaths}
          total={total}
          hasMore={hasMore}
          cwd={project.cwd}
          activeSessionPath={activeSessionPath}
          status={status}
          backgroundStatuses={backgroundStatuses}
          pinnedSessions={pinnedSessions}
          sessionDrag={sessionDrag}
          onSessionPointerDown={onSessionPointerDown}
          onSelectSession={onSelectSession}
          onTogglePinSession={onTogglePinSession}
          onDeleteSession={onDeleteSession}
          onToggleMore={() => setVisibleCount((c) => (hasMore ? c + PAGE_SIZE : PAGE_SIZE))}
        />
      )}
    </div>
  )
}
