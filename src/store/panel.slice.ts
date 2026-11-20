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

export interface PanelState {
  /** 右侧面板是否展开 */
  rightPanelOpen: boolean
  /** 已打开的标签页，按打开顺序排列；每种视图最多一个 */
  panelTabs: RightPanelView[]
  /** 当前标签页，null 表示停在「新标签页」 */
  rightPanelView: RightPanelView | null
  browserTarget: BrowserTarget | null
  filePreviewTarget: FilePreviewTarget | null
}

export interface PanelActions {
  toggleRightPanel: () => void
  /** 打开某个视图；面板收起时一并展开，快捷键才能一步到位 */
  openRightPanelView: (view: RightPanelView) => void
  openBrowserUrl: (url: string) => void
  openBrowserFile: (path: string) => void
  openWorkspaceFile: (path: string) => void
  setFilePreviewPath: (path: string | null) => void
  /** 回到「新标签页」，已开的标签保留 */
  showNewPanelTab: () => void
  closePanelTab: (view: RightPanelView) => void
}

type Setter = (updater: (state: PanelState) => Partial<PanelState>) => void

export const panelInitialState: PanelState = {
  rightPanelOpen: false,
  panelTabs: [],
  rightPanelView: null,
  browserTarget: null,
  filePreviewTarget: null,
}

let targetSeq = 0

function openTabState(s: PanelState, view: RightPanelView): Partial<PanelState> {
  return {
    rightPanelOpen: true,
    rightPanelView: view,
    panelTabs: s.panelTabs.includes(view) ? s.panelTabs : [...s.panelTabs, view],
  }
}

export function createPanelActions(set: Setter): PanelActions {
  return {
    toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

    openRightPanelView: (view) => set((s) => openTabState(s, view)),

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

    showNewPanelTab: () => set(() => ({ rightPanelView: null })),

    closePanelTab: (view) =>
      set((s) => {
        const index = s.panelTabs.indexOf(view)
        const panelTabs = s.panelTabs.filter((v) => v !== view)
        if (s.rightPanelView !== view) return { panelTabs }
        // 关掉的是当前页：焦点落到右邻，没有就左邻，都没有回到新标签页
        return { panelTabs, rightPanelView: panelTabs[index] ?? panelTabs[index - 1] ?? null }
      }),
  }
}
