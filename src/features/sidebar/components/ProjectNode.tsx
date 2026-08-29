import { useState } from 'react'
import { ChevronRight, Folder, SquarePen } from 'lucide-react'
import { Spinner } from '@/design/primitives/Spinner'
import type { ProjectGroup } from '@/shared/api/sessions'
import { formatTimestamp } from '@/shared/utils/format'
import { ProjectMenu } from './ProjectMenu'
import styles from './ProjectTree.module.css'

/** 折叠时每个项目最多露出的会话条数 */
const COLLAPSED_COUNT = 5

export interface ProjectNodeProps {
  project: ProjectGroup
  currentCwd: string | null
  activeSessionPath: string | null
  running: boolean
  awaitingInput: boolean
  onSelectProject: (cwd: string) => void
  onSelectSession: (cwd: string, sessionPath: string) => void
}

/**
 * 折叠时取前 N 条；当前会话若排在 N 之外则补进来。
 * 否则从展开态点了一条靠后的会话再收起，选中行会凭空消失。
 */
function visibleSessions(
  sessions: ProjectGroup['sessions'],
  showAll: boolean,
  activeSessionPath: string | null,
) {
  if (showAll || sessions.length <= COLLAPSED_COUNT) return sessions

  const head = sessions.slice(0, COLLAPSED_COUNT)
  const current = sessions.find((s) => s.path === activeSessionPath)
  return current && !head.includes(current) ? [...head, current] : head
}

/**
 * 同一项目里标题重复的那些会话。
 *
 * 会话标题取自首条提问，同样的开场白就会得到一模一样的标题——
 * 从旧会话 fork 出来的尤其如此。只给撞车的补时间，没撞的保持干净。
 */
function duplicatedTitles(sessions: ProjectGroup['sessions']): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const session of sessions) {
    if (seen.has(session.title)) dupes.add(session.title)
    else seen.add(session.title)
  }
  return dupes
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
  running,
  awaitingInput,
  onSelectProject,
  onSelectSession,
}: ProjectNodeProps) {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)

  const sessions = visibleSessions(project.sessions, showAll, activeSessionPath)
  const hidden = project.sessions.length - COLLAPSED_COUNT
  const dupes = duplicatedTitles(project.sessions)

  return (
    <div className={styles.project} data-open={open}>
      <div
        className={styles.projectRow}
        data-active={project.cwd === currentCwd && activeSessionPath === null}
        data-open={open}
        onClick={() => setOpen((v) => !v)}
        title={project.cwd}
      >
        <ChevronRight size={14} className={styles.chevron} data-open={open} />
        <Folder size={16} className={styles.folderIcon} />
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
            <SquarePen size={15} />
          </button>
        </div>
      </div>

      {open && (
        <>
          {sessions.map((session) => {
            const isCurrent = session.path === activeSessionPath
            return (
              <button
                key={session.path}
                type="button"
                className={styles.sessionRow}
                data-active={isCurrent}
                onClick={() => onSelectSession(project.cwd, session.path)}
                title={session.title}
              >
                <span className={styles.sessionTitle}>{session.title}</span>
                {dupes.has(session.title) && (
                  <span className={styles.when}>{formatTimestamp(session.modifiedMs)}</span>
                )}
                {isCurrent && awaitingInput && <span className={styles.badge}>需要用户输入</span>}
                {isCurrent && running && !awaitingInput && (
                  <Spinner size={13} ariaLabel="正在生成" />
                )}
              </button>
            )
          })}

          {hidden > 0 && (
            <button type="button" className={styles.more} onClick={() => setShowAll((v) => !v)}>
              {showAll ? '收起' : '展开显示'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
