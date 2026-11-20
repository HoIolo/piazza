import { getCurrentWindow } from '@tauri-apps/api/window'
import { create } from 'zustand'
import { readProjectPrefs, writeProjectPrefs } from '@/shared/utils/projectPrefs'
import {
  createPanelActions,
  panelInitialState,
  type PanelActions,
  type PanelState,
} from './panel.slice'
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

export type { RightPanelView } from './panel.slice'

interface AppState
  extends TerminalState, TerminalActions, SessionState, SessionActions, PanelState, PanelActions {
  theme: Theme
  /** 左侧栏是否展开 */
  sidebarOpen: boolean
  /** 环境信息是否停靠在会话区右侧。只在主区够宽时生效，窄时一律走顶栏弹窗 */
  envPanelOpen: boolean
  /** ⌘K 命令面板 */
  paletteOpen: boolean
  /** git 状态的刷新信号。切换分支等改动仓库的操作后自增，促使相关 hook 重取 */
  gitNonce: number
  /** 置顶的项目 cwd，侧栏据此把它们排到最前 */
  pinnedProjects: string[]
  /** 从侧栏隐藏的项目 cwd。只是不显示，不动任何会话文件 */
  hiddenProjects: string[]
  /** 置顶的会话文件路径，排在所属项目的最前 */
  pinnedSessions: string[]
  /** 设置视图是否展开 */
  settingsOpen: boolean
  /**
   * 设置视图是否已挂载。首次打开后保持为真——
   * 保留 DOM 才能播关闭动画，而未打开过时完全不挂载，就不会白读一次配置。
   */
  settingsMounted: boolean
  /** 打开设置时指定的分区 id；null 表示用默认分区 */
  settingsSection: string | null
  /** 按模型（provider/modelId）记住的上下文窗口档位（200k / 500k / 1M） */
  modelContextWindows: Record<string, number>

  setTheme: (theme: Theme) => void
  setModelContextWindow: (key: string, contextWindow: number) => void
  setModelContextWindows: (map: Record<string, number>) => void
  toggleSidebar: () => void
  toggleEnvPanel: () => void
  setPaletteOpen: (open: boolean) => void
  refreshGit: () => void
  togglePinnedProject: (cwd: string) => void
  hideProject: (cwd: string) => void
  togglePinnedSession: (path: string) => void
  openSettings: (section?: string) => void
  closeSettings: () => void
}

type SidebarPrefs = Pick<AppState, 'pinnedProjects' | 'hiddenProjects' | 'pinnedSessions'>

/** 有则去掉，无则加上 */
function toggled(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((v) => v !== item) : [...list, item]
}

/** 把改动并进侧栏偏好并落盘，返回要写回 store 的那部分 */
function persistPrefs(state: SidebarPrefs, patch: Partial<SidebarPrefs>): Partial<SidebarPrefs> {
  const next = { ...state, ...patch }
  writeProjectPrefs({
    pinned: next.pinnedProjects,
    hidden: next.hiddenProjects,
    pinnedSessions: next.pinnedSessions,
  })
  return patch
}

export const useAppStore = create<AppState>((set) => ({
  ...terminalInitialState,
  ...createTerminalActions(set),
  ...sessionInitialState,
  ...createSessionActions(set),
  ...panelInitialState,
  ...createPanelActions(set),
  theme: 'light',
  sidebarOpen: true,
  envPanelOpen: true,
  paletteOpen: false,
  gitNonce: 0,
  pinnedProjects: readProjectPrefs().pinned,
  hiddenProjects: readProjectPrefs().hidden,
  pinnedSessions: readProjectPrefs().pinnedSessions,
  settingsOpen: false,
  settingsMounted: false,
  settingsSection: null,
  modelContextWindows: {},

  setModelContextWindow: (key, contextWindow) =>
    set((s) => ({ modelContextWindows: { ...s.modelContextWindows, [key]: contextWindow } })),

  setModelContextWindows: (modelContextWindows) => set({ modelContextWindows }),

  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme
    /*
     * 窗口外观跟着应用主题走。毛玻璃的明暗由窗口外观决定而不是由网页决定——
     * 不同步的话，系统是浅色而应用切了深色，侧栏就是浅色材质上压着浅色字。
     */
    try {
      void getCurrentWindow()
        .setTheme(theme)
        .catch(() => undefined)
    } catch {
      // 不在 Tauri 里（浏览器调试、探针）时取不到窗口，主题照常切换即可
    }
    set({ theme })
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  toggleEnvPanel: () => set((s) => ({ envPanelOpen: !s.envPanelOpen })),

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  togglePinnedProject: (cwd) =>
    set((s) => persistPrefs(s, { pinnedProjects: toggled(s.pinnedProjects, cwd) })),

  hideProject: (cwd) =>
    set((s) =>
      s.hiddenProjects.includes(cwd)
        ? {}
        : persistPrefs(s, { hiddenProjects: [...s.hiddenProjects, cwd] }),
    ),

  togglePinnedSession: (path) =>
    set((s) => persistPrefs(s, { pinnedSessions: toggled(s.pinnedSessions, path) })),

  refreshGit: () => set((s) => ({ gitNonce: s.gitNonce + 1 })),

  openSettings: (section) =>
    set({ settingsOpen: true, settingsMounted: true, settingsSection: section ?? null }),

  closeSettings: () => set({ settingsOpen: false }),
}))
