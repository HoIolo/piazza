import { create } from 'zustand'
import { readProjectPrefs, writeProjectPrefs } from '@/shared/utils/projectPrefs'
import {
  createSessionActions,
  sessionInitialState,
  type SessionActions,
  type SessionState,
} from './session.slice'
import {
  createTerminalActions,
  terminalInitialState,
  type TerminalActions,
  type TerminalState,
} from './terminal.slice'

export type Theme = 'light' | 'dark'

/** 右侧面板的子视图。null 表示停在入口列表 */
export type RightPanelView = 'review' | 'files'

interface AppState extends TerminalState, TerminalActions, SessionState, SessionActions {
  theme: Theme
  /** 右侧面板（审阅/终端/文件）是否展开 */
  rightPanelOpen: boolean
  /** 面板内当前子视图，null 为入口列表 */
  rightPanelView: RightPanelView | null
  /** ⌘K 命令面板 */
  paletteOpen: boolean
  /** git 状态的刷新信号。切换分支等改动仓库的操作后自增，促使相关 hook 重取 */
  gitNonce: number
  /** 置顶的项目 cwd，侧栏据此把它们排到最前 */
  pinnedProjects: string[]
  /** 从侧栏隐藏的项目 cwd。只是不显示，不动任何会话文件 */
  hiddenProjects: string[]
  /** 设置视图是否展开 */
  settingsOpen: boolean
  /**
   * 设置视图是否已挂载。首次打开后保持为真——
   * 保留 DOM 才能播关闭动画，而未打开过时完全不挂载，就不会白读一次配置。
   */
  settingsMounted: boolean
  /** 打开设置时指定的分区 id；null 表示用默认分区 */
  settingsSection: string | null

  setTheme: (theme: Theme) => void
  toggleRightPanel: () => void
  /** 打开某个子视图；面板收起时一并展开，快捷键才能一步到位 */
  openRightPanelView: (view: RightPanelView) => void
  /** 返回入口列表 */
  closeRightPanelView: () => void
  setPaletteOpen: (open: boolean) => void
  refreshGit: () => void
  togglePinnedProject: (cwd: string) => void
  hideProject: (cwd: string) => void
  openSettings: (section?: string) => void
  closeSettings: () => void
}

export const useAppStore = create<AppState>((set) => ({
  ...terminalInitialState,
  ...createTerminalActions(set),
  ...sessionInitialState,
  ...createSessionActions(set),
  theme: 'light',
  rightPanelOpen: false,
  rightPanelView: null,
  paletteOpen: false,
  gitNonce: 0,
  pinnedProjects: readProjectPrefs().pinned,
  hiddenProjects: readProjectPrefs().hidden,
  settingsOpen: false,
  settingsMounted: false,
  settingsSection: null,

  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme
    set({ theme })
  },

  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  openRightPanelView: (rightPanelView) => set({ rightPanelOpen: true, rightPanelView }),

  closeRightPanelView: () => set({ rightPanelView: null }),

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  togglePinnedProject: (cwd) =>
    set((s) => {
      const pinned = s.pinnedProjects.includes(cwd)
        ? s.pinnedProjects.filter((p) => p !== cwd)
        : [...s.pinnedProjects, cwd]
      writeProjectPrefs({ pinned, hidden: s.hiddenProjects })
      return { pinnedProjects: pinned }
    }),

  hideProject: (cwd) =>
    set((s) => {
      const hidden = s.hiddenProjects.includes(cwd) ? s.hiddenProjects : [...s.hiddenProjects, cwd]
      writeProjectPrefs({ pinned: s.pinnedProjects, hidden })
      return { hiddenProjects: hidden }
    }),

  refreshGit: () => set((s) => ({ gitNonce: s.gitNonce + 1 })),

  openSettings: (section) =>
    set({ settingsOpen: true, settingsMounted: true, settingsSection: section ?? null }),

  closeSettings: () => set({ settingsOpen: false }),
}))
