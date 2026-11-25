import { getCurrentWindow } from '@tauri-apps/api/window'
import { create } from 'zustand'
import {
  applyThemeToDocument,
  normalizeCustomization,
  restoreCachedTheme,
} from '@/design/themes/applyTheme'
import type { ThemeCustomization, ThemeMode } from '@/design/themes/presets'
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
import {
  createUpdaterActions,
  updaterInitialState,
  type UpdaterActions,
  type UpdaterState,
} from './updater.slice'

export type Theme = ThemeMode

export type { RightPanelView } from './panel.slice'

const INITIAL_THEME = restoreCachedTheme()

function syncNativeWindowTheme(theme: ThemeMode): void {
  try {
    void getCurrentWindow()
      .setTheme(theme)
      .catch(() => undefined)
  } catch {
    // 非 Tauri 环境跳过
  }
}

interface AppState
  extends
    TerminalState,
    TerminalActions,
    SessionState,
    SessionActions,
    PanelState,
    PanelActions,
    ProjectPrefsState,
    ProjectPrefsActions,
    UpdaterState,
    UpdaterActions {
  theme: Theme
  /** 个性化外观（主题预设、强调色、对比度、自定义配色） */
  appearance: ThemeCustomization
  /** 左侧栏是否展开 */
  sidebarOpen: boolean
  /** 左侧栏当前宽度（px），供右侧工作区计算最大宽度 */
  sidebarWidth: number
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
  /** 直达入口每次都重新定位分区，即使上一次也是从同一入口打开 */
  settingsSection: { id: string; request: number } | null
  /** 按模型（provider/modelId）记住的上下文窗口档位（200k / 500k / 1M） */
  modelContextWindows: Record<string, number>

  setTheme: (theme: Theme) => void
  setAppearance: (appearance: ThemeCustomization) => void
  setModelContextWindow: (key: string, contextWindow: number) => void
  setModelContextWindows: (map: Record<string, number>) => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  toggleEnvPanel: () => void
  setPaletteOpen: (open: boolean) => void
  refreshGit: () => void
  openSettings: (section?: string) => void
  closeSettings: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  ...terminalInitialState,
  ...createTerminalActions(set),
  ...sessionInitialState,
  ...createSessionActions(set),
  ...panelInitialState,
  ...createPanelActions(set),
  ...projectPrefsInitialState,
  ...createProjectPrefsActions(set),
  ...updaterInitialState,
  ...createUpdaterActions(set, get),
  theme: INITIAL_THEME.mode,
  appearance: INITIAL_THEME.config,
  sidebarOpen: true,
  sidebarWidth: 275,
  // 默认收起：环境面板是「用户想看时才叫出来」的辅助信息，
  // 不该因为窗口够宽就自己占掉右侧一栏
  envPanelOpen: false,
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
    applyThemeToDocument(theme, get().appearance)
    syncNativeWindowTheme(theme)
    set({ theme })
  },

  setAppearance: (raw) => {
    const appearance = normalizeCustomization(raw)
    applyThemeToDocument(get().theme, appearance)
    set({ appearance })
  },

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),

  toggleEnvPanel: () => set((s) => ({ envPanelOpen: !s.envPanelOpen })),

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  refreshGit: () => set((s) => ({ gitNonce: s.gitNonce + 1 })),

  openSettings: (section) =>
    set((s) => ({
      settingsOpen: true,
      settingsMounted: true,
      settingsSection: section
        ? { id: section, request: (s.settingsSection?.request ?? 0) + 1 }
        : null,
    })),

  closeSettings: () => set({ settingsOpen: false }),
}))
