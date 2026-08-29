import { ChevronLeft } from 'lucide-react'
import { useAppStore } from '@/store/app.store'
import { PANEL_ENTRIES } from './entries'
import { FilesView } from './views/FilesView'
import { ReviewView } from './views/ReviewView'
import styles from './RightPanel.module.css'

const VIEWS = {
  review: ReviewView,
  files: FilesView,
} as const

/**
 * 右侧面板：入口列表 + 三个工作区视图。
 *
 * 环境信息不在这里——它是一眼扫过的状态，已挪到顶栏的弹窗。
 */
export function RightPanel({ open }: { open: boolean }) {
  const view = useAppStore((s) => s.rightPanelView)
  const openView = useAppStore((s) => s.openRightPanelView)
  const openTerminal = useAppStore((s) => s.toggleTerminal)
  const back = useAppStore((s) => s.closeRightPanelView)

  const entry = PANEL_ENTRIES.find((e) => e.view === view)
  const View = view ? VIEWS[view] : null

  return (
    <aside className={styles.panel} data-open={open} aria-hidden={!open}>
      <div className={styles.dragZone} data-tauri-drag-region />

      {View && entry ? (
        <div className={styles.viewWrap}>
          <div className={styles.viewHeader}>
            <button type="button" className={styles.back} onClick={back}>
              <ChevronLeft size={16} />
            </button>
            <span className={styles.viewTitle}>{entry.label}</span>
          </div>
          <div className={styles.viewBody}>
            <View />
          </div>
        </div>
      ) : (
        <div className={styles.list}>
          {PANEL_ENTRIES.map(({ view: v, label, hint, icon: Icon }) => (
            <button
              key={v}
              type="button"
              className={styles.row}
              onClick={() => (v === 'terminal' ? openTerminal() : openView(v))}
            >
              <Icon size={17} className={styles.icon} />
              <span className={styles.label}>{label}</span>
              <kbd className={styles.hint}>{hint}</kbd>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}
