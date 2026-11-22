import type { PanelState } from './panel.slice'

type Setter = (updater: (state: PanelState) => Partial<PanelState>) => void

/** 会话级面板记忆：离开时存、切回时取 */
export function sessionPanelActions(set: Setter) {
  return {
    savePanelForSession: (key: string) =>
      set((s) => ({
        panelBySession: {
          ...s.panelBySession,
          [key]: {
            rightPanelOpen: s.rightPanelOpen,
            panelTabs: s.panelTabs,
            activeTabId: s.activeTabId,
          },
        },
      })),

    /*
     * 恢复时标签 id 原样带回：它们是面板自己的序号（`files:3`），
     * 跨会话唯一，不需要重编号。没有记录就当作「这个会话没开过面板」，
     * 面板收起、标签清空——正是用户期望的「切到没开的会话就关闭」。
     */
    restorePanelForSession: (key: string) =>
      set((s) => {
        const saved = s.panelBySession[key]
        if (!saved) return { rightPanelOpen: false, panelTabs: [], activeTabId: null }
        return {
          rightPanelOpen: saved.rightPanelOpen,
          panelTabs: saved.panelTabs,
          activeTabId: saved.activeTabId,
        }
      }),
  }
}
