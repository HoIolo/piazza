import { useEffect, useRef, type ComponentType, type CSSProperties } from 'react'
import { MessageSquarePlus, Plus, X } from 'lucide-react'
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
  const activeId = useAppStore((s) => s.activeTabId)
  const selectTab = useAppStore((s) => s.selectPanelTab)
  const closeTab = useAppStore((s) => s.closePanelTab)
  const showNewTab = useAppStore((s) => s.showNewPanelTab)
  const openAnother = useAppStore((s) => s.openAnotherPanelTab)
  const activeTab = useRef<HTMLDivElement>(null)
  // 当前是侧边聊天时，额外给一个「再开一个」——Codex 的侧边聊天可并排多开
  const onSideChat = tabs.some((t) => t.id === activeId && t.view === 'sidechat')

  useEffect(() => {
    const tab = activeTab.current
    const strip = tab?.parentElement
    if (!tab || !strip) return
    const { left, right } = tab.getBoundingClientRect()
    const bounds = strip.getBoundingClientRect()
    strip.scrollLeft += Math.min(0, left - bounds.left) + Math.max(0, right - bounds.right)
  }, [activeId])

  return (
    <nav className={styles.tabBar} aria-label="工作区标签" data-tauri-drag-region="deep">
      <div className={styles.tabStrip} data-tauri-drag-region="deep">
        {tabs.map((tab) => {
          const { label, icon: Icon } = PANEL_TABS[tab.view]
          // 同类第二个起加序号，和 Codex 的「Side chat 2」一致
          const title = tab.index > 1 ? `${label} ${tab.index}` : label
          const active = tab.id === activeId
          return (
            <div
              className={styles.tab}
              data-active={active}
              key={tab.id}
              ref={active ? activeTab : null}
            >
              <button type="button" aria-pressed={active} onClick={() => selectTab(tab.id)}>
                <Icon size={14} />
                {title}
              </button>
              <IconButton size="sm" ariaLabel={`关闭${title}`} onClick={() => closeTab(tab.id)}>
                <X size={13} />
              </IconButton>
            </div>
          )
        })}
      </div>
      {onSideChat && (
        <IconButton size="sm" ariaLabel="再开一个侧边聊天" onClick={() => openAnother('sidechat')}>
          <MessageSquarePlus size={15} />
        </IconButton>
      )}
      {tabs.length > 0 && (
        <IconButton size="sm" ariaLabel="新标签页" active={activeId === null} onClick={showNewTab}>
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
  const activeId = useAppStore((s) => s.activeTabId)
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
        {activeId === null && <NewPanelTab />}
        {tabs.map((tab) => {
          const View = views[tab.view]
          return (
            <div key={tab.id} className={styles.view} hidden={activeId !== tab.id}>
              <View />
            </div>
          )
        })}
      </div>
    </aside>
  )
}
