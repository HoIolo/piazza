import {
  Blocks,
  Keyboard,
  Layers,
  MessagesSquare,
  Settings as SettingsIcon,
  ShieldCheck,
  Sun,
  Terminal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type SectionId =
  | 'general'
  | 'appearance'
  | 'models'
  | 'shortcuts'
  | 'packages'
  | 'permissions'
  | 'sessions'
  | 'environment'

export interface SectionItem {
  id: SectionId
  label: string
  icon: LucideIcon
}

export interface SectionGroup {
  group: string
  items: SectionItem[]
}

/**
 * 设置分区。沿用 Codex 的分组版式，但内容换成 pi 真正能配置的项——
 * 语音、宠物、电脑操控等在 pi 里没有对应能力，建出来只会是点了没反应的死开关。
 */
export const SECTION_GROUPS: SectionGroup[] = [
  {
    group: '个人',
    items: [
      { id: 'general', label: '常规', icon: SettingsIcon },
      { id: 'appearance', label: '外观', icon: Sun },
      { id: 'models', label: '模型与 Provider', icon: Layers },
      { id: 'shortcuts', label: '键盘快捷键', icon: Keyboard },
    ],
  },
  {
    group: '集成',
    items: [{ id: 'packages', label: '扩展与包', icon: Blocks }],
  },
  {
    group: '编码',
    items: [
      { id: 'permissions', label: '权限', icon: ShieldCheck },
      { id: 'sessions', label: '会话', icon: MessagesSquare },
      { id: 'environment', label: '环境', icon: Terminal },
    ],
  },
]

export const SECTION_TITLES: Record<SectionId, string> = {
  general: '常规',
  appearance: '外观',
  models: '模型与 Provider',
  shortcuts: '键盘快捷键',
  packages: '扩展与包',
  permissions: '权限',
  sessions: '会话',
  environment: '环境',
}
