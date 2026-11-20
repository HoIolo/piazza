import { useRef } from 'react'
import { useGitBranch } from '@/shared/hooks/useGitBranch'
import { useMinWidth } from '@/shared/hooks/useMinWidth'
import { basename } from '@/shared/utils/path'
import { useAppStore } from '@/store/app.store'
import { useChatStore, useSessionActions } from '@/store/chat'
import { Composer } from '../composer'
import { ChatBody } from './components/ChatBody'
import { DialogCard } from './components/DialogCard'
import { EnvDock } from './components/EnvDock'
import { ErrorBanner } from './components/ErrorBanner'
import { TopBar } from './components/TopBar'
import styles from './ChatView.module.css'

/**
 * 主区至少多宽才把环境信息停靠成右侧卡片。
 *
 * 对齐 Codex：内容区最大宽为 768px（含内边距 800px），右侧环境卡片加边距占 312px，
 * 至少需要 768 + 312 = 1080px 才停靠到右侧；默认 1200px 窗口展开侧栏时主区仅约
 * 925px，此时收回顶栏弹窗，避免挤压中间会话正文。
 */
const ENV_DOCK_MIN_WIDTH = 1080

function resolveChatTitle(
  isEmpty: boolean,
  sessionName: string | undefined,
  previewName: string | null,
  projectName: string,
): string | null {
  if (isEmpty) return null
  return sessionName ?? previewName ?? projectName
}

/** 主区容器：顶栏 + （空状态 | 消息流）+ 输入区，够宽时右侧再停靠环境信息 */
export function ChatView() {
  const mainRef = useRef<HTMLElement>(null)
  const wide = useMinWidth(mainRef, ENV_DOCK_MIN_WIDTH)

  const cwd = useAppStore((s) => s.currentCwd)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const envPanelOpen = useAppStore((s) => s.envPanelOpen)
  const toggleEnvPanel = useAppStore((s) => s.toggleEnvPanel)
  const reconnectSession = useAppStore((s) => s.reconnectSession)

  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const session = useChatStore((s) => s.session)
  const previewName = useChatStore((s) => s.previewName)
  const setDraft = useChatStore((s) => s.setDraft)
  const sessionLoading = useChatStore((s) => s.sessionLoading)
  const error = useChatStore((s) => s.error)
  const setError = useChatStore((s) => s.setError)
  const pendingDialog = useChatStore((s) => s.pendingDialog)
  const { renameSession, exportHtml, answerDialog } = useSessionActions()

  const branch = useGitBranch(cwd)
  const projectName = cwd ? basename(cwd) : '未选择项目'
  const isEmpty = messages.length === 0 && !streaming
  // 空状态下分支与工作模式已在输入框上方的上下文条里，卡片再摆一份就是重复
  const envDocked = wide && !isEmpty

  return (
    <main ref={mainRef} className={styles.main} data-sidebar-open={sidebarOpen}>
      <TopBar
        title={resolveChatTitle(isEmpty, session?.sessionName, previewName, projectName)}
        cwd={cwd}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        envDocked={envDocked}
        envPanelOpen={envPanelOpen}
        onToggleEnvPanel={toggleEnvPanel}
        onRename={(name) => void renameSession(name)}
        onExport={exportHtml}
      />

      <div className={styles.body}>
        <div className={styles.column}>
          {error && (
            <ErrorBanner
              error={error}
              onReconnect={reconnectSession}
              onDismiss={() => setError(null)}
            />
          )}

          <ChatBody
            loading={sessionLoading}
            empty={isEmpty}
            projectName={projectName}
            onPickSuggestion={setDraft}
          />

          {pendingDialog && (
            <div className={styles.dialogSlot}>
              <DialogCard
                key={pendingDialog.id}
                dialog={pendingDialog}
                /* id 由这里补上，卡片只关心用户选了什么 */
                onAnswer={(payload) => void answerDialog({ id: pendingDialog.id, ...payload })}
              />
            </div>
          )}

          <Composer projectName={projectName} branch={branch} showContextBar={isEmpty} />
        </div>

        {envDocked && <EnvDock />}
      </div>
    </main>
  )
}
