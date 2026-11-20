import { useRef, type KeyboardEvent } from 'react'
import { useAutoResize } from '@/shared/hooks/useAutoResize'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { useAppStore } from '@/store/app.store'
import { useChatActions, useChatStore } from '@/store/chat'
import { ComposerToolbar, type PrimaryAction } from './components/ComposerToolbar'
import { ContextBar } from './components/ContextBar'
import type { DraftAttachment } from '@/shared/api/attachments'
import { ComposerInput } from './components/ComposerInput'
import { useSlashMenu } from './hooks/useSlashMenu'
import { useAttachments } from './hooks/useAttachments'
import { useComposerSubmit } from './hooks/useComposerSubmit'
import { AttachmentTray } from './components/AttachmentTray'
import { QueuedMessages } from './components/QueuedMessages'
import { useMentionItems } from './hooks/useMentionItems'
import { useMentionPanel } from './hooks/useMentionPanel'
import styles from './Composer.module.css'

export interface ComposerProps {
  projectName: string
  branch: string | null
  /** 空状态才显示上下文条 */
  showContextBar: boolean
}

/** 输入区行高，须与 Composer.module.css 的 .input 一致 */
const LINE_HEIGHT = 20

/** 输入区高度上限：视口的四分之一，向下取整到整行，免得末行被切掉半截 */
function maxInputHeight(): number {
  const cap = Math.floor((window.innerHeight * 0.25) / LINE_HEIGHT) * LINE_HEIGHT
  return Math.max(LINE_HEIGHT * 4, cap)
}

function primaryAction(streaming: boolean, hasText: boolean): PrimaryAction {
  return !streaming ? 'send' : hasText ? 'steer' : 'stop'
}

export function Composer({ projectName, branch, showContextBar }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const draft = useChatStore((s) => s.draft)
  const setDraft = useChatStore((s) => s.setDraft)
  const cwd = useAppStore((s) => s.currentCwd)
  const { abort, isStreaming } = useChatActions()

  const panel = useMentionPanel({ draft, setDraft, textareaRef, rootRef })
  const groups = useMentionItems(cwd, panel.query)
  const ime = useImeGuard()
  const sendingBlocked = useChatStore((s) => !s.rpcReady || s.pendingDialog !== null)
  const slash = useSlashMenu(draft, !panel.open, groups.commands, rootRef, setDraft)
  const stopArmed = useChatStore((s) => s.stopArmed)

  useAutoResize(textareaRef, draft, maxInputHeight())

  const attachments = useAttachments(rootRef)
  const { submit } = useComposerSubmit(panel.close)
  const hasText = draft.trim().length > 0 || attachments.files.length > 0
  const action = primaryAction(isStreaming, hasText)

  const restoreText = (file: DraftAttachment) => {
    if (file.text === undefined) return
    panel.appendText(file.text)
    attachments.remove(file.id)
  }

  /*
   * Enter 发送、Shift+Enter 换行，运行中 Enter 是引导、⌘/Ctrl+Enter 是排队。
   * 输入法组合期间的 Enter 必须放行，否则中文选词会被误当作发送。
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ime.isComposing(e)) return
    if (slash.onKeyDown(e)) return
    if (e.key === 'Escape' && panel.open) {
      // 标记这次 Esc 已被用掉：全局快捷键见到 defaultPrevented 就不会拿它去停止运行
      e.preventDefault()
      panel.close()
      return
    }
    if (!isSubmitKey(e) || attachments.reading) return
    e.preventDefault()
    void submit(e.metaKey || e.ctrlKey ? 'followUp' : 'steer')
  }

  return (
    <div className={styles.composer} ref={rootRef}>
      <QueuedMessages />
      {showContextBar && <ContextBar projectName={projectName} branch={branch} />}
      <div
        className={styles.box}
        data-dragging={attachments.dragging}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
            attachments.setDragging(true)
          }
        }}
        onDragLeave={() => attachments.setDragging(false)}
        onDrop={attachments.drop}
      >
        <AttachmentTray
          files={attachments.files}
          reading={attachments.reading}
          remove={attachments.remove}
          restoreText={restoreText}
        />
        {attachments.error && (
          <p className={styles.attachmentError} role="alert">
            {attachments.error}
          </p>
        )}
        <ComposerInput
          draft={draft}
          setDraft={setDraft}
          textareaRef={textareaRef}
          panel={panel}
          groups={groups}
          slash={slash}
          ime={ime}
          placeholder={showContextBar ? '随心输入' : '和 pi 一起工作'}
          onPaste={attachments.paste}
          onKeyDown={handleKeyDown}
          onPickFromDisk={(directory) => {
            panel.close()
            void attachments.pick(directory)
          }}
        />
        <ComposerToolbar
          action={action}
          isStreaming={isStreaming}
          disabled={primaryDisabled(action, hasText, sendingBlocked || attachments.reading)}
          stopArmed={stopArmed && isStreaming}
          onPrimary={() => (action === 'stop' ? void abort() : void submit())}
          onStop={() => void abort()}
          attachOpen={panel.attachOpen}
          onToggleAttach={panel.toggleAttach}
        />
      </div>
    </div>
  )
}

function primaryDisabled(action: PrimaryAction, hasText: boolean, sendingBlocked: boolean) {
  return action !== 'stop' && (sendingBlocked || !hasText)
}

function isSubmitKey(event: KeyboardEvent<HTMLTextAreaElement>) {
  return event.key === 'Enter' && !event.shiftKey && !event.altKey
}
