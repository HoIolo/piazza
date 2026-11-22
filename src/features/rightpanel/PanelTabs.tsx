import { useEffect, useRef, useState, type WheelEvent } from 'react'
import { MessageSquarePlus, Plus, X } from 'lucide-react'
import { Dialog } from '@/design/primitives/Dialog'
import { IconButton } from '@/design/primitives/IconButton'
import { useAppStore } from '@/store/app.store'
import { PANEL_TABS } from './entries'
import styles from './RightPanel.module.css'

export function PanelTabs() {
  const tabs = useAppStore((s) => s.panelTabs)
  const activeId = useAppStore((s) => s.activeTabId)
  const selectTab = useAppStore((s) => s.selectPanelTab)
  const closeTab = useAppStore((s) => s.closePanelTab)
  const showNewTab = useAppStore((s) => s.showNewPanelTab)
  const openAnother = useAppStore((s) => s.openAnotherPanelTab)
  const activeTab = useRef<HTMLDivElement>(null)
  // 有内容的侧边聊天关掉就没了，先拦一下防误触
  const [closing, setClosing] = useState<{ id: string; title: string } | null>(null)
  const content = useAppStore((s) => s.panelTabContent)
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

  /*
   * 滚动条藏起来了，但普通鼠标只有竖直滚轮：在标签条上把纵向滚轮转成横向滚动，
   * 否则标签溢出后只能靠触控板横扫才看得到后面的标签。
   */
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const strip = event.currentTarget
    if (strip.scrollWidth <= strip.clientWidth) return
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    strip.scrollLeft += event.deltaY
    event.preventDefault()
  }

  return (
    <nav className={styles.tabBar} aria-label="工作区标签" data-tauri-drag-region="deep">
      <div className={styles.tabStrip} data-tauri-drag-region="deep" onWheel={onWheel}>
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
              <IconButton
                size="sm"
                ariaLabel={`关闭${title}`}
                onClick={() =>
                  tab.view === 'sidechat' && content[tab.id]
                    ? setClosing({ id: tab.id, title })
                    : closeTab(tab.id)
                }
              >
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
      {closing && (
        <Dialog
          title={`关闭${closing.title}？`}
          confirmLabel="关闭"
          onClose={() => setClosing(null)}
          onConfirm={() => {
            closeTab(closing.id)
            setClosing(null)
          }}
        >
          <p>这个标签里的对话不会被保留。</p>
        </Dialog>
      )}
    </nav>
  )
}
