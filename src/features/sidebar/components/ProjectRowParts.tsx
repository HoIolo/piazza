import { ComposeIcon } from '@/design/icons'
import type { SessionMeta } from '@/shared/api/sessions'
import { dragHandlers } from './projectDrag'
import { ProjectMenu } from './ProjectMenu'
import { SessionRow, type SessionStatus } from './SessionRow'
import styles from './ProjectTree.module.css'

/** 项目行尾的两个动作：更多菜单与「在此项目新建对话」 */
export function ProjectRowActions({
  cwd,
  onNewSession,
}: {
  cwd: string
  onNewSession: () => void
}) {
  return (
    <div className={styles.rowActions}>
      <ProjectMenu cwd={cwd} />
      <button
        type="button"
        className={styles.action}
        onClick={(event) => {
          event.stopPropagation()
          onNewSession()
        }}
        aria-label="在此项目新建对话"
        title="在此项目新建对话"
      >
        <ComposeIcon size={18} />
      </button>
    </div>
  )
}

export interface SessionListProps {
  cwd: string
  sessions: SessionMeta[]
  total: number
  hasMore: boolean
  activeSessionPath: string | null
  status: SessionStatus
  backgroundStatuses: ReadonlyMap<string, SessionStatus>
  pinnedSessions: string[]
  /** 项目内正在拖的会话（拖的不是本项目时为 null） */
  sessionDrag: { from: string; over: string | null } | null
  onSessionDragStart: (path: string) => void
  onSessionDragOver: (path: string) => void
  onSessionDragEnd: () => void
  onSessionDrop: (visiblePaths: string[], to: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
  onTogglePinSession: (sessionPath: string) => void
  onDeleteSession: (sessionPath: string) => void
  onToggleMore: () => void
}

/** 项目下的会话列表 + 展开/收起按钮 */
export function SessionList({
  cwd,
  sessions,
  total,
  hasMore,
  activeSessionPath,
  status,
  backgroundStatuses,
  pinnedSessions,
  sessionDrag,
  onSessionDragStart,
  onSessionDragOver,
  onSessionDragEnd,
  onSessionDrop,
  onSelectSession,
  onTogglePinSession,
  onDeleteSession,
  onToggleMore,
}: SessionListProps) {
  if (sessions.length === 0) return null
  const visiblePaths = sessions.map((s) => s.path)
  return (
    <div className={styles.sessionList}>
      {sessions.map((session) => {
        const active = session.path === activeSessionPath
        const rowStatus = active ? status : (backgroundStatuses.get(session.path) ?? null)
        return (
          <SessionRow
            key={session.path}
            session={session}
            active={active}
            pinned={pinnedSessions.includes(session.path)}
            status={rowStatus}
            dragging={sessionDrag?.from === session.path}
            dropTarget={sessionDrag?.over === session.path && sessionDrag.from !== session.path}
            dragHandlers={dragHandlers(session.path, {
              draggable: true,
              onDragStart: () => onSessionDragStart(session.path),
              onDragOver: () => onSessionDragOver(session.path),
              onDragEnd: onSessionDragEnd,
              onDrop: () => onSessionDrop(visiblePaths, session.path),
            })}
            onSelect={() => onSelectSession(cwd, session.path)}
            onTogglePin={() => onTogglePinSession(session.path)}
            onDelete={() => onDeleteSession(session.path)}
          />
        )
      })}

      {total > 5 && (
        <button type="button" className={styles.more} onClick={onToggleMore}>
          {hasMore ? '展开显示' : '收起'}
        </button>
      )}
    </div>
  )
}
