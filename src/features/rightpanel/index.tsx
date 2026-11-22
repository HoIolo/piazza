import { type ComponentType, type CSSProperties } from 'react'
import { useAppStore, type RightPanelView } from '@/store/app.store'
import { PANEL_TABS } from './entries'
import { BrowserView } from './views/BrowserView'
import { FilesView } from './views/FilesView'
import { ReviewView } from './views/ReviewView'
import { PanelTabs } from './PanelTabs'
import { usePanelWidth } from './usePanelWidth'
import styles from './RightPanel.module.css'

const ENTRIES = ['files', 'sidechat', 'browser', 'terminal'] as const

function NewPanelTab() {
  const openView = useAppStore((s) => s.openRightPanelView)

  return (
    <div className={styles.start}>
      <div className={styles.tools} role="menu" aria-label="新标签页">
        {ENTRIES.map((view) => {
          const { label, hint, icon: Icon } = PANEL_TABS[view]
          return (
            <button
              key={view}
              type="button"
              role="menuitem"
              className={styles.row}
              onClick={() => openView(view)}
            >
              <Icon size={16} className={styles.icon} />
              <span>{label}</span>
              {hint && <kbd className={styles.hint}>{hint}</kbd>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 视图可以接收 tabId：侧边聊天靠它把「有没有内容」回报给 store */
type PanelView = ComponentType<{ tabId?: string }>

export function RightPanel({
  open,
  sideChat,
  terminal,
}: {
  open: boolean
  sideChat: PanelView
  terminal: PanelView
}) {
  const tabs = useAppStore((s) => s.panelTabs)
  const activeId = useAppStore((s) => s.activeTabId)
  const resize = usePanelWidth()
  const views: Record<RightPanelView, PanelView> = {
    review: ReviewView,
    files: FilesView,
    browser: BrowserView,
    sidechat: sideChat,
    terminal,
  }

  return (
    <aside
      className={styles.panel}
      data-open={open}
      data-dragging={resize.dragging}
      style={{ '--panel-width': `${resize.width}px` } as CSSProperties}
      inert={!open}
      aria-label="右侧工作区"
    >
      <div className={styles.resize} {...resize.handle} />
      <PanelTabs />
      <div className={styles.surface}>
        {activeId === null && <NewPanelTab />}
        {tabs.map((tab) => {
          const View = views[tab.view]
          return (
            <div key={tab.id} className={styles.view} hidden={activeId !== tab.id}>
              <View tabId={tab.id} />
            </div>
          )
        })}
      </div>
    </aside>
  )
}
