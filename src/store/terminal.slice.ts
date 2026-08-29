/** 一个终端标签。cwd 在创建时定下，之后不随当前项目变动 */
export interface TerminalTabInfo {
  id: string
  cwd: string | null
}

export interface TerminalState {
  /** 底部终端面板是否展开 */
  terminalOpen: boolean
  terminalTabs: TerminalTabInfo[]
  activeTerminalTab: string | null
}

export interface TerminalActions {
  toggleTerminal: () => void
  closeTerminal: () => void
  addTerminalTab: () => void
  closeTerminalTab: (id: string) => void
  setActiveTerminalTab: (id: string) => void
}

/** 新标签开在当前项目下，因此这个切片要能读到 cwd */
type Slice = TerminalState & { currentCwd: string | null }
type Setter = (updater: (state: Slice) => Partial<TerminalState>) => void

export const terminalInitialState: TerminalState = {
  terminalOpen: false,
  terminalTabs: [],
  activeTerminalTab: null,
}

/** 标签 id 只需在本次运行内唯一 */
let seq = 0
const nextId = () => `t${++seq}`

/**
 * 终端标签的状态放在 store 而不是面板组件里：
 * 「打开面板」与「保证至少有一个标签」是同一个动作的两半，
 * 拆到组件里就得靠 effect 补齐，那会多一轮渲染。
 */
export function createTerminalActions(set: Setter): TerminalActions {
  return {
    toggleTerminal: () =>
      set((s) => {
        if (s.terminalOpen) return { terminalOpen: false }
        if (s.terminalTabs.length > 0) return { terminalOpen: true }
        const tab = { id: nextId(), cwd: s.currentCwd }
        return { terminalOpen: true, terminalTabs: [tab], activeTerminalTab: tab.id }
      }),

    closeTerminal: () => set(() => ({ terminalOpen: false })),

    addTerminalTab: () =>
      set((s) => {
        const tab = { id: nextId(), cwd: s.currentCwd }
        return { terminalTabs: [...s.terminalTabs, tab], activeTerminalTab: tab.id }
      }),

    closeTerminalTab: (id) =>
      set((s) => {
        const terminalTabs = s.terminalTabs.filter((t) => t.id !== id)
        // 关掉的是当前标签时焦点落到最后一个；一个不剩就把面板也收起来
        const activeTerminalTab =
          s.activeTerminalTab === id
            ? (terminalTabs[terminalTabs.length - 1]?.id ?? null)
            : s.activeTerminalTab
        return { terminalTabs, activeTerminalTab, terminalOpen: terminalTabs.length > 0 }
      }),

    setActiveTerminalTab: (activeTerminalTab) => set(() => ({ activeTerminalTab })),
  }
}
