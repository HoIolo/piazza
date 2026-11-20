import { useEffect, useRef, type ComponentType, type CSSProperties } from 'react'
import { Plus, X } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { useAppStore, type RightPanelView } from '@/store/app.store'
import { PANEL_TABS } from './entries'
import { BrowserView } from './views/BrowserView'
import { FilesView } from './views/FilesView'
import { ReviewView } from './views/ReviewView'
import { usePanelWidth } from './usePanelWidth'
import styles from './RightPanel.module.css'

function PanelTabs() {
  const tabs = useAppStore((s) => s.panelTabs)
  const view = useAppStore((s) => s.rightPanelView)
  const openView = useAppStore((s) => s.openRightPanelView)
  const closeTab = useAppStore((s) => s.closePanelTab)
  const showNewTab = useAppStore((s) => s.showNewPanelTab)
  const activeTab = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tab = activeTab.current
    const strip = tab?.parentElement
    if (!tab || !strip) return
    const { left, right } = tab.getBoundingClientRect()
    const bounds = strip.getBoundingClientRect()
    strip.scrollLeft += Math.min(0, left - bounds.left) + Math.max(0, right - bounds.right)
  }, [view])

  return (
    <nav className={styles.tabBar} aria-label="工作区标签" data-tauri-drag-region>
      <div className={styles.tabStrip} data-tauri-drag-region>
        {tabs.map((tab) => {
          const { label, icon: Icon } = PANEL_TABS[tab]
          const active = tab === view
          return (
            <div
              className={styles.tab}
              data-active={active}
              key={tab}
              ref={active ? activeTab : null}
            >
              <button type="button" aria-pressed={active} onClick={() => openView(tab)}>
                <Icon size={14} />
                {label}
              </button>
              <IconButton size="sm" ariaLabel={`关闭${label}`} onClick={() => closeTab(tab)}>
                <X size={13} />
              </IconButton>
            </div>
          )
        })}
      </div>
      {tabs.length > 0 && (
        <IconButton size="sm" ariaLabel="新标签页" active={view === null} onClick={showNewTab}>
          <Plus size={15} />
        </IconButton>
      )}
    </nav>
  )
}

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

export function RightPanel({
  open,
  sideChat,
  terminal,
}: {
  open: boolean
  sideChat: ComponentType
  terminal: ComponentType
}) {
  const tabs = useAppStore((s) => s.panelTabs)
  const view = useAppStore((s) => s.rightPanelView)
  const resize = usePanelWidth()
  const views: Record<RightPanelView, ComponentType> = {
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
        {view === null && <NewPanelTab />}
        {tabs.map((tab) => {
          const View = views[tab]
          return (
            <div key={tab} className={styles.view} hidden={view !== tab}>
              <View />
            </div>
          )
        })}
      </div>
    </aside>
  )
}
