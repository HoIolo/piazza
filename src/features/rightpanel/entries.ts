import type { ComponentType } from 'react'
import { GitCompare } from 'lucide-react'
import type { IconProps } from '@/design/icons'
import {
  WorkspaceFileIcon,
  WorkspaceBrowserIcon,
  WorkspaceChatIcon,
  WorkspaceTerminalIcon,
} from '@/design/icons/CodexIcon'
import type { RightPanelView } from '@/store/app.store'
import { shortcut } from '@/shared/utils/platform'

export const PANEL_TABS = {
  review: { label: '审阅', hint: '⌃⇧G', icon: GitCompare },
  files: { label: '文件', hint: shortcut('P'), icon: WorkspaceFileIcon },
  browser: { label: '浏览器', hint: '', icon: WorkspaceBrowserIcon },
  sidechat: { label: '侧边聊天', hint: '', icon: WorkspaceChatIcon },
  terminal: { label: '终端', hint: '', icon: WorkspaceTerminalIcon },
} satisfies Record<RightPanelView, { label: string; hint: string; icon: ComponentType<IconProps> }>
