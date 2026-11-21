import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ComposeIcon, FolderIcon, FolderOpenIcon } from '@/design/icons'
import type { ProjectGroup } from '@/shared/api/sessions'
import { ProjectMenu } from './ProjectMenu'
import { SessionRow, type SessionStatus } from './SessionRow'
import styles from './ProjectTree.module.css'

/** 初始露出及每次点击「展开显示」递增的会话条数（对齐 Codex：每次多展开 5 个） */
const PAGE_SIZE = 5

export interface ProjectNodeProps {
  project: ProjectGroup
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
        role="button"
        tabIndex={0}
        aria-expanded={open}
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

        <div className={styles.rowActions}>
          <ProjectMenu cwd={project.cwd} />
          <button
            type="button"
            className={styles.action}
            onClick={(e) => {
              e.stopPropagation()
              onSelectProject(project.cwd)
            }}
            aria-label="在此项目新建对话"
            title="在此项目新建对话"
          >
            <ComposeIcon size={18} />
          </button>
        </div>
      </div>

      {open && sessions.length > 0 && (
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
                onSelect={() => onSelectSession(project.cwd, session.path)}
                onTogglePin={() => onTogglePinSession(session.path)}
                onDelete={() => onDeleteSession(session.path)}
              />
            )
          })}

          {total > PAGE_SIZE && (
            <button
              type="button"
              className={styles.more}
              onClick={() => setVisibleCount((c) => (hasMore ? c + PAGE_SIZE : PAGE_SIZE))}
            >
              {hasMore ? '展开显示' : '收起'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
