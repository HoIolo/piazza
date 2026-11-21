import {
  Blocks,
  BookOpen,
  FileText,
  Keyboard,
  Layers,
  Monitor,
  Palette,
  Server,
  SlidersHorizontal,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type SectionId =
  | 'appearance'
  | 'behavior'
  | 'models'
  | 'instructions'
  | 'skills'
  | 'mcp'
  | 'packages'
  | 'shortcuts'
  | 'system'

export interface SectionItem {
  id: SectionId
  label: string
  subtitle?: string
  icon: LucideIcon
  /** 用于侧栏搜索匹配具体配置项，输入「代理」「压缩」「主题」也能定位到对应分区 */
  keywords: string[]
}

export interface SectionGroup {
  group: string
  items: SectionItem[]
}

/**
 * 参考 PI-Desktop D684 分区架构：一个页面只负责一个清晰主题，
 * 移除 TUI 专属与底层队列/魔法数字配置，强化模型、指令、技能与 MCP 管理。
 */
export const SECTION_GROUPS: SectionGroup[] = [
  {
    group: '偏好设置',
    items: [
      {
        id: 'appearance',
        label: '外观',
        subtitle: '调整界面主题与对话排版字号，立即生效',
        icon: Palette,
        keywords: ['主题', '浅色', '深色', '暗黑', '字号', '字体', 'theme', 'font'],
      },
      {
        id: 'shortcuts',
        label: '快捷键',
        subtitle: 'Piazza 全局与聊天编辑快捷键一览',
        icon: Keyboard,
        keywords: ['键盘', '快捷键', '命令面板', 'shortcut'],
      },
    ],
  },
  {
    group: 'Agent 与能力',
    items: [
      {
        id: 'behavior',
        label: 'Agent 行为',
        subtitle: '新会话的默认模型、思考强度、项目信任与运行策略',
        icon: SlidersHorizontal,
        keywords: ['默认模型', '思考', '推理', '信任', '权限', '压缩', '重试', '图片', 'model', 'trust'],
      },
      {
        id: 'models',
        label: '模型与账号',
        subtitle: '连接厂商账号和 API Key，管理自定义服务商与模型',
        icon: Layers,
        keywords: ['provider', 'api', 'key', '模型', '上下文', 'endpoint', 'baseurl'],
      },
      {
        id: 'instructions',
        label: '全局指令',
        subtitle: '编辑 ~/.pi/agent/AGENTS.md，对所有项目的会话生效',
        icon: FileText,
        keywords: ['agents.md', '系统提示', '规范', '指令', 'prompt', 'instructions'],
      },
      {
        id: 'skills',
        label: '技能',
        subtitle: '浏览、创建和编辑全局与项目级 SKILL.md 技能',
        icon: BookOpen,
        keywords: ['skill', '技能', 'skill.md', '能力'],
      },
      {
        id: 'mcp',
        label: 'MCP 服务器',
        subtitle: '管理 ~/.pi/agent/mcp.json 中的外部工具与服务连接',
        icon: Server,
        keywords: ['mcp', 'stdio', 'http', 'sse', '工具', '服务器'],
      },
      {
        id: 'packages',
        label: '扩展与包',
        subtitle: '查看本地扩展脚本并管理 settings.json 中的扩展包',
        icon: Blocks,
        keywords: ['扩展', '插件', '包', 'npm', 'git', 'package', 'extension'],
      },
    ],
  },
  {
    group: '系统',
    items: [
      {
        id: 'system',
        label: '运行时与系统',
        subtitle: '内置 Pi SDK、网络代理与配置数据目录',
        icon: Monitor,
        keywords: ['pi', '路径', '运行时', '代理', 'proxy', 'http', '配置目录', '数据'],
      },
    ],
  },
]

const ALL_ITEMS = SECTION_GROUPS.flatMap((g) => g.items)

export const SECTION_META: Record<SectionId, SectionItem> = Object.fromEntries(
  ALL_ITEMS.map((item) => [item.id, item]),
) as Record<SectionId, SectionItem>

export const DEFAULT_SECTION: SectionId = 'behavior'
