import { useMemo, useRef, type CSSProperties } from 'react'
import { GripHorizontal, Layers, Minimize2, X } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { focusCuWindow, unwatchCuWindow, type ControlledWindow } from '@/shared/api/computerUse'
import { useComputerUseStore, type PreviewFrame } from '@/store/computerUse.store'
import { PreviewCard } from './PreviewCard'
import { usePreviewDrag } from './usePreviewDrag'
import styles from './ComputerUsePreview.module.css'

function orderWindows(windows: ControlledWindow[], focusedId: number | null): ControlledWindow[] {
  if (focusedId === null) return windows
  const front = windows.find((w) => w.windowId === focusedId)
  if (!front) return windows
  return [front, ...windows.filter((w) => w.windowId !== focusedId)]
}

interface PreviewBodyProps {
  ordered: ControlledWindow[]
  frames: Record<number, PreviewFrame>
  expanded: boolean
  onFocusCard: (windowId: number) => void
}

function PreviewBody({ ordered, frames, expanded, onFocusCard }: PreviewBodyProps) {
  const focus = (id: number) => () => void focusCuWindow(id).catch(() => undefined)
  const stop = (id: number) => () => void unwatchCuWindow(id).catch(() => undefined)

  if (expanded) {
    return (
      <div key="expanded" className={styles.expandedList}>
        {ordered.map((win) => (
          <PreviewCard
            key={win.windowId}
            win={win}
            frame={frames[win.windowId]}
            onFocusWindow={focus(win.windowId)}
            onStopWatch={stop(win.windowId)}
          />
        ))}
      </div>
    )
  }

  const stackDepth = Math.min(ordered.length, 3)
  return (
    <div key="stacked" className={styles.stackWrap} data-depth={stackDepth}>
      {ordered.slice(0, 3).map((win, index) => (
        <PreviewCard
          key={win.windowId}
          win={win}
          frame={frames[win.windowId]}
          stackedLayer={index}
          onBringToFront={() => onFocusCard(win.windowId)}
          onFocusWindow={focus(win.windowId)}
          onStopWatch={stop(win.windowId)}
        />
      ))}
      {ordered.length > 3 && <span className={styles.extraPill}>+{ordered.length - 3}</span>}
    </div>
  )
}

/**
 * 右上角 Codex 风格操作预览浮窗：
 * - 默认停靠右上角，支持按顶部把手或主卡标题栏自由拖拽（双击复位）
 * - 多窗口时默认呈 3 层错落叠放，点击后方露出的窗口即可置顶，也可平滑展开并滚动查看
 * - 打开/关闭与展开/叠起均带平滑过渡动效，隐藏后不中断后台操控
 */
export function ComputerUsePreview() {
  const windows = useComputerUseStore((s) => s.windows)
  const frames = useComputerUseStore((s) => s.frames)
  const focusedWindowId = useComputerUseStore((s) => s.focusedWindowId)
  const previewOpen = useComputerUseStore((s) => s.previewOpen)
  const expanded = useComputerUseStore((s) => s.expanded)
  const position = useComputerUseStore((s) => s.position)
  const focusCard = useComputerUseStore((s) => s.focusCard)
  const setPreviewOpen = useComputerUseStore((s) => s.setPreviewOpen)
  const setExpanded = useComputerUseStore((s) => s.setExpanded)
  const setPosition = useComputerUseStore((s) => s.setPosition)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const { onPointerDown, isDragging } = usePreviewDrag(containerRef, position, setPosition)
  const ordered = useMemo(() => orderWindows(windows, focusedWindowId), [windows, focusedWindowId])

  if (ordered.length === 0) return null

  const containerStyle = position
    ? ({ left: position.x, top: position.y, '--cu-top': `${position.y}px` } as CSSProperties)
    : undefined

  return (
    <aside
      ref={containerRef}
      className={styles.container}
      data-open={previewOpen}
      data-dragging={isDragging}
      data-docked={position === null}
      style={containerStyle}
      aria-label="桌面控制实时预览"
      aria-hidden={!previewOpen}
      inert={!previewOpen ? true : undefined}
      onPointerDown={onPointerDown}
    >
      <div
        className={styles.toolbar}
        data-drag-handle="true"
        onDoubleClick={() => setPosition(null)}
        title="拖拽移动预览位置，双击复位右上角"
      >
        <div className={styles.titleGroup}>
          <GripHorizontal size={14} />
          <span className={styles.titleText}>操作预览</span>
          {ordered.length > 1 && <span className={styles.countBadge}>{ordered.length} 个窗口</span>}
        </div>
        <div className={styles.toolbarActions} data-no-drag="true">
          {ordered.length > 1 && (
            <IconButton
              ariaLabel={expanded ? '叠起窗口' : '展开全部窗口'}
              size="sm"
              active={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 size={13} /> : <Layers size={13} />}
            </IconButton>
          )}
          <IconButton
            ariaLabel="关闭小窗预览"
            title="隐藏预览（后台继续控制）"
            size="sm"
            onClick={() => setPreviewOpen(false)}
          >
            <X size={13} />
          </IconButton>
        </div>
      </div>

      <div className={styles.bodyShell} data-expanded={expanded}>
        <PreviewBody ordered={ordered} frames={frames} expanded={expanded} onFocusCard={focusCard} />
      </div>
    </aside>
  )
}
