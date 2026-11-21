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
}

type Setter = (updater: (state: PanelState) => Partial<PanelState>) => void

export const panelInitialState: PanelState = {
  rightPanelOpen: false,
  panelTabs: [],
  activeTabId: null,
  reviewTarget: null,
  browserTarget: null,
  filePreviewTarget: null,
}

let targetSeq = 0
let tabSeq = 0

/** 单例视图：同一个视图已有标签就复用，避免开出两个「文件」 */
const SINGLETON: ReadonlySet<RightPanelView> = new Set(['review', 'files', 'browser', 'terminal'])

function makeTab(view: RightPanelView, existing: PanelTab[]): PanelTab {
  const index = existing.filter((t) => t.view === view).length + 1
  return { id: `${view}:${(tabSeq += 1)}`, view, index }
}

function openTabState(s: PanelState, view: RightPanelView): Partial<PanelState> {
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
function tabActions(
  set: Setter,
): Pick<
  PanelActions,
  | 'toggleRightPanel'
  | 'openRightPanelView'
  | 'openAnotherPanelTab'
  | 'selectPanelTab'
  | 'showNewPanelTab'
  | 'closePanelTab'
> {
  return {
    toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

    openRightPanelView: (view, preserveReviewTarget) =>
      set((s) => ({
        ...openTabState(s, view),
        ...(view === 'review' && !preserveReviewTarget && { reviewTarget: null }),
      })),

    openAnotherPanelTab: (view) => {
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

    selectPanelTab: (id) => set(() => ({ activeTabId: id })),

    showNewPanelTab: () => set(() => ({ activeTabId: null })),

    closePanelTab: (id) =>
      set((s) => {
        const index = s.panelTabs.findIndex((t) => t.id === id)
        const panelTabs = s.panelTabs.filter((t) => t.id !== id)
        /*
         * 关掉最后一个标签就连面板一起收起。
         * 留着面板停在「新标签页」是空转——那块地方什么也没有，
         * 还得再按一次 ⌘\ 才能回到对话，多一步且没有信息量。
         */
        if (panelTabs.length === 0) {
          return { panelTabs: [], activeTabId: null, rightPanelOpen: false }
        }
        if (s.activeTabId !== id) return { panelTabs }
        // 关掉的是当前页：焦点落到右邻，没有就左邻
        return {
          panelTabs,
          activeTabId: panelTabs[index]?.id ?? panelTabs[index - 1]?.id ?? null,
        }
      }),
  }
}

export function createPanelActions(set: Setter): PanelActions {
  return {
    ...tabActions(set),

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
