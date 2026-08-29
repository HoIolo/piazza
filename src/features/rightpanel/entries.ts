import { FileText, GitCompare, TerminalSquare } from 'lucide-react'
import type { RightPanelView } from '@/store/app.store'

/** 终端不是面板内的子视图，它开的是底部那块横跨窗口的面板 */
export type PanelTarget = RightPanelView | 'terminal'

export interface PanelEntry {
  view: PanelTarget
  label: string
  /** 快捷键展示文本。每一项都在 useGlobalShortcuts 里真实绑定，不摆样子 */
  hint: string
  icon: typeof FileText
}

/*
 * Codex 原版还有「浏览器」，pi 没有浏览器控制能力，
 * 摆上去就是个点了没反应的死按钮，故不列入。
 */
export const PANEL_ENTRIES: PanelEntry[] = [
  { view: 'review', label: '审阅', hint: '⌃⇧G', icon: GitCompare },
  { view: 'terminal', label: '终端', hint: '⌘T', icon: TerminalSquare },
  { view: 'files', label: '文件', hint: '⌘P', icon: FileText },
]
