import { ArrowUpRight, Monitor, X } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import type { ControlledWindow } from '@/shared/api/computerUse'
import type { PreviewFrame } from '@/store/computerUse.store'
import styles from './PreviewCard.module.css'

export interface PreviewCardProps {
  win: ControlledWindow
  frame?: PreviewFrame
  stackedLayer?: number
  onBringToFront?: () => void
  onFocusWindow: () => void
  onStopWatch: () => void
}

function CardHeader({
  win,
  isBackCard,
  onFocusWindow,
  onStopWatch,
}: {
  win: ControlledWindow
  isBackCard: boolean
  onFocusWindow: () => void
  onStopWatch: () => void
}) {
  return (
    <div className={styles.cardHeader} data-drag-handle={!isBackCard ? 'true' : undefined}>
      <div className={styles.appMeta}>
        <span className={styles.dot} data-active={win.active} />
        {win.appIcon ? (
          <img className={styles.appIcon} src={win.appIcon} alt="" draggable={false} />
        ) : (
          <Monitor size={14} />
        )}
        <div className={styles.appText}>
          <span className={styles.appName}>{win.appName}</span>
          {win.title && <span className={styles.windowTitle}>{win.title}</span>}
        </div>
      </div>
      <div className={styles.actions} data-no-drag="true" onClick={(e) => e.stopPropagation()}>
        <IconButton ariaLabel="切到目标窗口" size="sm" onClick={onFocusWindow}>
          <ArrowUpRight size={13} />
        </IconButton>
        <IconButton ariaLabel="停止观察该窗口" size="sm" tone="danger" onClick={onStopWatch}>
          <X size={13} />
        </IconButton>
      </div>
    </div>
  )
}

export function PreviewCard({
  win,
  frame,
  stackedLayer,
  onBringToFront,
  onFocusWindow,
  onStopWatch,
}: PreviewCardProps) {
  const isStacked = stackedLayer !== undefined
  const isBackCard = isStacked && stackedLayer > 0

  return (
    <div
      className={styles.card}
      data-stacked={isStacked ? 'true' : undefined}
      data-layer={stackedLayer}
      onClick={isBackCard ? onBringToFront : undefined}
    >
      <CardHeader
        win={win}
        isBackCard={isBackCard}
        onFocusWindow={onFocusWindow}
        onStopWatch={onStopWatch}
      />

      <div className={styles.viewport}>
        {frame ? (
          <img className={styles.frameImg} src={frame.src} alt={win.appName} draggable={false} />
        ) : (
          <div className={styles.placeholder}>
            <Monitor size={18} />
            <span>{win.streamError ? '需「屏幕录制」权限以显示实时画面' : '正在连接画面流…'}</span>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.actionLabel}>{win.lastAction || '已连接'}</span>
        <span className={styles.stateTag} data-active={win.active}>
          {win.active ? '控制中' : '已连接'}
        </span>
      </div>
    </div>
  )
}
