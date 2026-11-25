import { Fragment, type PointerEvent } from 'react'
import { ComposeIcon } from '@/design/icons'
import type { SessionMeta } from '@/shared/api/sessions'
import { computeDropIndicatorIndex, dragRowStyle } from './projectDrag'
import { ProjectMenu } from './ProjectMenu'
import { SessionRow, type SessionStatus } from './SessionRow'
import type { ActiveSidebarDrag } from './useSidebarDrag'
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
    <div className={styles.rowActions} data-no-drag="true">
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
  /** 含折叠区的完整排序列表，重排时不丢失折叠区已保存的顺序 */
  allOrderedPaths: string[]
  total: number
  hasMore: boolean
  activeSessionPath: string | null
  status: SessionStatus
  backgroundStatuses: ReadonlyMap<string, SessionStatus>
  pinnedSessions: string[]
  /** 项目内正在拖的会话（拖的不是本项目时为 null） */
  sessionDrag: ActiveSidebarDrag | null
  onSessionPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    path: string,
    pinned: boolean,
    allPaths: string[],
  ) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
  onTogglePinSession: (sessionPath: string) => void
  onDeleteSession: (sessionPath: string) => void
  onToggleMore: () => void
}

/** 项目下的会话列表 + 展开/收起按钮 */
export function SessionList({
  cwd,
  sessions,
  allOrderedPaths,
  total,
  hasMore,
  activeSessionPath,
  status,
  backgroundStatuses,
  pinnedSessions,
  sessionDrag,
  onSessionPointerDown,
  onSelectSession,
  onTogglePinSession,
  onDeleteSession,
  onToggleMore,
}: SessionListProps) {
  if (sessions.length === 0) return null
  const visiblePaths = sessions.map((s) => s.path)
  const indicatorIndex = computeDropIndicatorIndex(
    visiblePaths,
    sessionDrag?.from ?? null,
    sessionDrag?.over ?? null,
  )

  return (
    <div className={styles.sessionList} data-session-list={cwd}>
      {sessions.map((session, index) => {
        const active = session.path === activeSessionPath
        const pinned = pinnedSessions.includes(session.path)
        const rowStatus = active ? status : (backgroundStatuses.get(session.path) ?? null)
        const dragging = sessionDrag?.from === session.path
        return (
          <Fragment key={session.path}>
            {indicatorIndex === index && (
              <div className={styles.dropIndicator} aria-hidden="true" />
            )}
            <SessionRow
              session={session}
              active={active}
              pinned={pinned}
              status={rowStatus}
              dragging={dragging}
              dragStyle={dragRowStyle(dragging, sessionDrag?.offsetY ?? 0)}
              onPointerDown={(event) =>
                onSessionPointerDown(event, session.path, pinned, allOrderedPaths)
              }
              onSelect={() => onSelectSession(cwd, session.path)}
              onTogglePin={() => onTogglePinSession(session.path)}
              onDelete={() => onDeleteSession(session.path)}
            />
          </Fragment>
        )
      })}

      {indicatorIndex === sessions.length && (
        <div className={styles.dropIndicator} aria-hidden="true" />
      )}

      {total > 5 && (
        <button type="button" className={styles.more} onClick={onToggleMore}>
          {hasMore ? '展开显示' : '收起'}
        </button>
      )}
    </div>
  )
}
