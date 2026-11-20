import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ComposeIcon, FolderIcon, FolderOpenIcon } from '@/design/icons'
import type { ProjectGroup } from '@/shared/api/sessions'
import { ProjectMenu } from './ProjectMenu'
import { SessionRow, type SessionStatus } from './SessionRow'
import styles from './ProjectTree.module.css'

/** 折叠时每个项目最多露出的会话条数 */
const COLLAPSED_COUNT = 5

export interface ProjectNodeProps {
  project: ProjectGroup
  currentCwd: string | null
  activeSessionPath: string | null
  status: SessionStatus
  /** 置顶的会话路径 */
  pinnedSessions: string[]
  onSelectProject: (cwd: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
  onTogglePinSession: (sessionPath: string) => void
  onDeleteSession: (sessionPath: string) => void
}

/** 每次展开项目时默认仅展示前 5 条会话（对齐 Codex） */
function visibleSessions(sessions: ProjectGroup['sessions'], showAll: boolean) {
  if (showAll || sessions.length <= COLLAPSED_COUNT) return sessions
  return sessions.slice(0, COLLAPSED_COUNT)
}

/**
 * 一个项目及其会话列表。
 *
 * 项目行点击是「收起/展开这个项目」，不是「选中项目」——
 * 选中（即在该项目下开新对话）交给行尾那支笔，两件事分开才不会互相误触。
 */
export function ProjectNode({
  project,
  currentCwd,
  activeSessionPath,
  status,
  pinnedSessions,
  onSelectProject,
  onSelectSession,
  onTogglePinSession,
  onDeleteSession,
}: ProjectNodeProps) {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)

  // 折叠项目或重新展开时，重置内部「展开显示」状态，确保每次打开只展示 5 个
  const toggleOpen = () => {
    setOpen((v) => !v)
    setShowAll(false)
  }

  // 置顶的提前，其余保持后端按最近修改排好的顺序（sort 是稳定的）
  const ordered = [...project.sessions].sort(
    (a, b) => Number(pinnedSessions.includes(b.path)) - Number(pinnedSessions.includes(a.path)),
  )
  const sessions = visibleSessions(ordered, showAll)
  const hidden = project.sessions.length - COLLAPSED_COUNT

  return (
    <div className={styles.project} data-open={open}>
      <div
        className={styles.projectRow}
        data-active={project.cwd === currentCwd}
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
          {sessions.map((session) => (
            <SessionRow
              key={session.path}
              session={session}
              active={session.path === activeSessionPath}
              pinned={pinnedSessions.includes(session.path)}
              status={status}
              onSelect={() => onSelectSession(project.cwd, session.path)}
              onTogglePin={() => onTogglePinSession(session.path)}
              onDelete={() => onDeleteSession(session.path)}
            />
          ))}

          {hidden > 0 && (
            <button type="button" className={styles.more} onClick={() => setShowAll((v) => !v)}>
              {showAll ? '收起' : '展开显示'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
