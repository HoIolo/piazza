import { CircleHelp, ShieldCheck } from 'lucide-react'
import { PinIcon } from '@/design/icons'
import { Spinner } from '@/design/primitives/Spinner'
import type { SessionMeta } from '@/shared/api/sessions'
import { SessionTitle } from './SessionTitle'
import { SessionRowMenu } from './SessionRowMenu'
import styles from './SessionRow.module.css'

export type SessionStatus = 'loading' | 'working' | 'reply' | 'input' | 'confirm' | null

export interface SessionRowProps {
  session: SessionMeta
  active: boolean
  pinned: boolean
  status: SessionStatus
  onSelect: () => void
  onTogglePin: () => void
  onDelete: () => void
}

const STATUS_TEXT = {
  loading: '读取会话',
  working: '工作中',
  reply: '等待回复',
  input: '等待回答',
  confirm: '等待确认',
}

function Trailing({ active, status }: SessionRowProps) {
  if (!active || !status) return null
  const Icon = status === 'confirm' ? ShieldCheck : status === 'input' ? CircleHelp : undefined
  return (
    <span
      className={styles.badge}
      data-status={status}
      role="status"
      aria-label={STATUS_TEXT[status]}
      title={STATUS_TEXT[status]}
    >
      {Icon ? <Icon size={14} /> : <Spinner size={12} />}
    </span>
  )
}

/** 会话行尾仅显示状态；悬停或键盘聚焦时显示操作，保持标题静止。 */
export function SessionRow(props: SessionRowProps) {
  const { session, active, pinned, onSelect, onTogglePin, onDelete } = props

  return (
    <div
      className={styles.row}
      role="button"
      tabIndex={0}
      data-session-path={session.path}
      data-active={active}
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        onSelect()
      }}
      title={session.title}
    >
      {pinned && <PinIcon size={14} className={styles.pin} />}
      <SessionTitle title={session.title} />

      <span className={styles.trailing}>
        <span className={styles.status}>
          <Trailing {...props} />
        </span>
        <span className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            aria-label={pinned ? '取消置顶' : '置顶对话'}
            aria-pressed={pinned}
            onClick={(e) => {
              e.stopPropagation()
              onTogglePin()
            }}
          >
            <PinIcon size={16} />
          </button>
          <SessionRowMenu
            path={session.path}
            pinned={pinned}
            onTogglePin={onTogglePin}
            onDelete={onDelete}
          />
        </span>
      </span>
    </div>
  )
}
