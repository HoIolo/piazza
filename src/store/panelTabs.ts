import type { PanelState, PanelTab, RightPanelView } from './panel.slice'

let tabSeq = 0

/** 单例视图：同一个视图已有标签就复用，避免开出两个「文件」 */
const SINGLETON: ReadonlySet<RightPanelView> = new Set(['review', 'files', 'browser', 'terminal'])

export function makeTab(view: RightPanelView, existing: PanelTab[]): PanelTab {
  const index = existing.filter((t) => t.view === view).length + 1
  return { id: `${view}:${(tabSeq += 1)}`, view, index }
}

export function openTabState(s: PanelState, view: RightPanelView): Partial<PanelState> {
  const found = SINGLETON.has(view) ? s.panelTabs.find((t) => t.view === view) : undefined
  if (found) return { rightPanelOpen: true, activeTabId: found.id }
  const tab = makeTab(view, s.panelTabs)
  return {
    rightPanelOpen: true,
    activeTabId: tab.id,
    panelTabs: [...s.panelTabs, tab],
  }
}

/** 标签的开关与切换。单独抽出来，createPanelActions 才不超行数上限 */
