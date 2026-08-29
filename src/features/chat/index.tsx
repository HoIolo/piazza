import { useGitBranch } from '@/shared/hooks/useGitBranch'
import { basename } from '@/shared/utils/path'
import { useAppStore } from '@/store/app.store'
import { useChatStore, useSessionActions } from '@/store/chat'
import { Composer } from '../composer'
import { DialogCard } from './components/DialogCard'
import { EmptyState } from './components/EmptyState'
import { ErrorBanner } from './components/ErrorBanner'
import { MessageList } from './components/MessageList'
import { MessageListSkeleton } from './components/MessageListSkeleton'
import { TopBar } from './components/TopBar'
import styles from './ChatView.module.css'

/** 主区容器：顶栏 + （空状态 | 消息流）+ 输入区 */
export function ChatView() {
  const cwd = useAppStore((s) => s.currentCwd)
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen)
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel)
  const terminalOpen = useAppStore((s) => s.terminalOpen)
  const toggleTerminal = useAppStore((s) => s.toggleTerminal)
  const reconnectSession = useAppStore((s) => s.reconnectSession)

  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const session = useChatStore((s) => s.session)
  const setDraft = useChatStore((s) => s.setDraft)
  const sessionLoading = useChatStore((s) => s.sessionLoading)
  const error = useChatStore((s) => s.error)
  const setError = useChatStore((s) => s.setError)
  const pendingDialog = useChatStore((s) => s.pendingDialog)
  const { renameSession, exportHtml, answerDialog } = useSessionActions()

  const branch = useGitBranch(cwd)
  const projectName = cwd ? basename(cwd) : '未选择项目'
  const isEmpty = messages.length === 0 && !streaming

  return (
    <main className={styles.main}>
      <TopBar
        title={isEmpty ? null : (session?.sessionName ?? projectName)}
        cwd={cwd}
        terminalOpen={terminalOpen}
        onToggleTerminal={toggleTerminal}
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={toggleRightPanel}
        onRename={(name) => void renameSession(name)}
        onExport={exportHtml}
      />

      {error && (
        <ErrorBanner
          error={error}
          onReconnect={reconnectSession}
          onDismiss={() => setError(null)}
        />
      )}

      {sessionLoading ? (
        <MessageListSkeleton />
      ) : isEmpty ? (
        <EmptyState projectName={projectName} onPickSuggestion={setDraft} />
      ) : (
        <MessageList />
      )}

      {pendingDialog && (
        <div className={styles.dialogSlot}>
          <DialogCard
            dialog={pendingDialog}
            /* id 由这里补上，卡片只关心用户选了什么 */
            onAnswer={(payload) => void answerDialog({ id: pendingDialog.id, ...payload })}
          />
        </div>
      )}

      <Composer projectName={projectName} branch={branch} showContextBar={isEmpty} />
    </main>
  )
}
