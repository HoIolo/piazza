import { getCurrentWindow } from '@tauri-apps/api/window'
import { create } from 'zustand'
import {
  createPanelActions,
  panelInitialState,
  type PanelActions,
  type PanelState,
} from './panel.slice'
import {
  createProjectPrefsActions,
  projectPrefsInitialState,
  type ProjectPrefsActions,
  type ProjectPrefsState,
} from './projectPrefs.slice'
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
  extends
    TerminalState,
    TerminalActions,
    SessionState,
    SessionActions,
    PanelState,
    PanelActions,
    ProjectPrefsState,
    ProjectPrefsActions {
  theme: Theme
  /** 左侧栏是否展开 */
  sidebarOpen: boolean
  /** 环境信息是否停靠在会话区右侧。只在主区够宽时生效，窄时一律走顶栏弹窗 */
  envPanelOpen: boolean
  /** ⌘K 命令面板 */
  paletteOpen: boolean
  /** git 状态的刷新信号。切换分支等改动仓库的操作后自增，促使相关 hook 重取 */
  gitNonce: number
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
  openSettings: (section?: string) => void
  closeSettings: () => void
}

export const useAppStore = create<AppState>((set) => ({
  ...terminalInitialState,
  ...createTerminalActions(set),
  ...sessionInitialState,
  ...createSessionActions(set),
  ...panelInitialState,
  ...createPanelActions(set),
  ...projectPrefsInitialState,
  ...createProjectPrefsActions(set),
  theme: 'light',
  sidebarOpen: true,
  envPanelOpen: true,
  paletteOpen: false,
  gitNonce: 0,
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

  refreshGit: () => set((s) => ({ gitNonce: s.gitNonce + 1 })),

  openSettings: (section) =>
    set({ settingsOpen: true, settingsMounted: true, settingsSection: section ?? null }),

  closeSettings: () => set({ settingsOpen: false }),
}))
