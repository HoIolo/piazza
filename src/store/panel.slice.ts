import { sessionPanelActions } from './panelSession'
import { makeTab, openTabState } from './panelTabs'

/** 右侧面板里能开成标签页的视图 */
export type RightPanelView = 'review' | 'files' | 'browser' | 'sidechat' | 'terminal'

export interface BrowserTarget {
  kind: 'url' | 'html'
  value: string
  nonce: number
}

export interface FilePreviewTarget {
  path: string
  nonce: number
}

/**
 * 一个标签页实例。
 *
 * 早先 panelTabs 直接存视图名、每种视图最多一个。侧边聊天要能像 Codex 那样
 * 并排开好几个（「侧边聊天」「侧边聊天 2」…），所以改成实例列表：id 唯一，
 * view 说明它渲染什么，index 只用于生成标题。
 */
export interface PanelTab {
  id: string
  view: RightPanelView
  /** 同类标签里的序号，从 1 开始；标题用它区分 */
  index: number
}

export interface PanelState {
  /** 右侧面板是否展开 */
  rightPanelOpen: boolean
  /** 已打开的标签页，按打开顺序排列 */
  panelTabs: PanelTab[]
  /** 当前标签页 id，null 表示停在「新标签页」 */
  activeTabId: string | null
  /** 标签里是否已有内容（目前只有侧边聊天会写），决定关标签时要不要先确认 */
  panelTabContent: Record<string, boolean>
  /** 各会话各自的面板状态，键为 liveSessionPath（新会话用空串） */
  panelBySession: Record<string, PanelSnapshot>
  reviewTarget: { cwd: string; path: string; diff: string; nonce: number } | null
  browserTarget: BrowserTarget | null
  filePreviewTarget: FilePreviewTarget | null
}

export interface PanelActions {
  toggleRightPanel: () => void
  /** 打开某个视图；面板收起时一并展开，快捷键才能一步到位 */
  openRightPanelView: (view: RightPanelView, preserveReviewTarget?: boolean) => void
  /** 再开一个同类标签（侧边聊天用），返回新 id */
  openAnotherPanelTab: (view: RightPanelView) => string
  /** 切到某个标签 */
  selectPanelTab: (id: string) => void
  openFileDiff: (cwd: string, path: string, diff: string) => void
  openBrowserUrl: (url: string) => void
  openBrowserFile: (path: string) => void
  openWorkspaceFile: (path: string) => void
  setFilePreviewPath: (path: string | null) => void
  /** 回到「新标签页」，已开的标签保留 */
  showNewPanelTab: () => void
  closePanelTab: (id: string) => void
  /** 由视图自己上报：这个标签里现在有没有会被关掉的内容 */
  setPanelTabContent: (id: string, has: boolean) => void
  /** 离开某个会话前把面板状态存起来 */
  savePanelForSession: (key: string) => void
  /** 切到某个会话时把它的面板状态恢复回来 */
  restorePanelForSession: (key: string) => void
}

/** 面板在某个会话里的样子 */
export interface PanelSnapshot {
  rightPanelOpen: boolean
  panelTabs: PanelTab[]
  activeTabId: string | null
}

type Setter = (updater: (state: PanelState) => Partial<PanelState>) => void

export const panelInitialState: PanelState = {
  rightPanelOpen: false,
  panelTabs: [],
  activeTabId: null,
  panelTabContent: {},
  panelBySession: {},
  reviewTarget: null,
  browserTarget: null,
  filePreviewTarget: null,
}

let targetSeq = 0

/** 标签的开关与切换。单独抽出来，createPanelActions 才不超行数上限 */
function tabActions(set: Setter) {
  return {
    toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
    openRightPanelView: (view: RightPanelView, preserveReviewTarget?: boolean) =>
      set((s) => ({
        ...openTabState(s, view),
        ...(view === 'review' && !preserveReviewTarget && { reviewTarget: null }),
      })),
    openAnotherPanelTab: (view: RightPanelView) => {
      // 序号必须按当前已开的同类标签算，传空数组会永远得到 1
      let created = ''
      set((s) => {
        const tab = makeTab(view, s.panelTabs)
        created = tab.id
        return {
          rightPanelOpen: true,
          activeTabId: tab.id,
          panelTabs: [...s.panelTabs, tab],
        }
      })
      return created
    },
    selectPanelTab: (id: string) => set(() => ({ activeTabId: id })),
    closePanelTab: (id: string) =>
      set((s) => {
        const index = s.panelTabs.findIndex((t) => t.id === id)
        const panelTabs = s.panelTabs.filter((t) => t.id !== id)
        // 一并清掉内容标记，否则关掉又重开的标签会继承上一次的「有内容」
        const panelTabContent = { ...s.panelTabContent }
        delete panelTabContent[id]
        /*
         * 关掉最后一个标签就连面板一起收起。
         * 留着面板停在「新标签页」是空转——那块地方什么也没有，
         * 还得再按一次 ⌘\ 才能回到对话，多一步且没有信息量。
         */
        if (panelTabs.length === 0) {
          return { panelTabs: [], panelTabContent, activeTabId: null, rightPanelOpen: false }
        }
        if (s.activeTabId !== id) return { panelTabs, panelTabContent }
        // 关掉的是当前页：焦点落到右邻，没有就左邻
        return {
          panelTabs,
          panelTabContent,
          activeTabId: panelTabs[index]?.id ?? panelTabs[index - 1]?.id ?? null,
        }
      }),
  }
}

export function createPanelActions(set: Setter): PanelActions {
  return {
    ...tabActions(set),
    ...sessionPanelActions(set),
    showNewPanelTab: () => set(() => ({ activeTabId: null })),
    // 视图上报标签内容，只影响关标签时要不要确认
    setPanelTabContent: (id, has) =>
      set((s) =>
        s.panelTabContent[id] === has
          ? {}
          : { panelTabContent: { ...s.panelTabContent, [id]: has } },
      ),

    openFileDiff: (cwd, path, diff) =>
      set((s) => ({
        ...openTabState(s, 'review'),
        reviewTarget: { cwd, path, diff, nonce: (targetSeq += 1) },
      })),

    openBrowserUrl: (url) =>
      set((s) => ({
        ...openTabState(s, 'browser'),
        browserTarget: { kind: 'url', value: url, nonce: (targetSeq += 1) },
      })),

    openBrowserFile: (path) =>
      set((s) => ({
        ...openTabState(s, 'browser'),
        browserTarget: { kind: 'html', value: path, nonce: (targetSeq += 1) },
      })),

    openWorkspaceFile: (path) =>
      set((s) => ({
        ...openTabState(s, 'files'),
        filePreviewTarget: { path, nonce: (targetSeq += 1) },
      })),

    setFilePreviewPath: (path) =>
      set(() => ({
        filePreviewTarget: path ? { path, nonce: (targetSeq += 1) } : null,
      })),
  }
}
