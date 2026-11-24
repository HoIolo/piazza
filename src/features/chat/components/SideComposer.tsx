import { useRef, type KeyboardEvent } from 'react'
import { ArrowUp, CornerDownRight, Square } from 'lucide-react'
import type { ImageContent, SessionState, StreamingBehavior } from '@/rpc/types'
import { AttachmentTray } from '@/shared/components/AttachmentTray'
import { ModelPicker, type ModelPickerController } from '@/shared/components/ModelPicker'
import { TrustPicker } from '@/shared/components/TrustPicker'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { shortcut } from '@/shared/utils/platform'
import { useChatStore } from '@/store/chat'
import { SideAttachMenu } from './SideAttachMenu'
import { useSideComposer } from './useSideComposer'
import styles from './SideChat.module.css'

function isEnterSubmit(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.altKey
}

function SidePrimaryButton({
  running,
  hasContent,
  disabled,
  onStop,
}: {
  running: boolean
  hasContent: boolean
  disabled: boolean
  onStop: () => Promise<boolean>
}) {
  if (running && !hasContent) {
    return (
      <button
        type="button"
        className={styles.send}
        aria-label="停止侧边聊天"
        title="停止"
        onClick={() => void onStop()}
      >
        <Square size={13} />
      </button>
    )
  }
  const label = running ? `引导（${shortcut('↵')} 改为排队）` : '发送侧边聊天消息'
  return (
    <button
      type="submit"
      className={styles.send}
      aria-label={label}
      title={running ? label : '发送'}
      disabled={disabled}
    >
      {running ? <CornerDownRight size={16} /> : <ArrowUp size={17} />}
    </button>
  )
}

/** 侧边聊天输入区：与主输入区保持一致的粘贴图片、拖拽/选择附件、引导与独立模型选择器 */
export function SideComposer({
  blocked,
  running,
  session,
  modelController,
  onSend,
  onStop,
}: {
  blocked: boolean
  running: boolean
  session: SessionState | null
  modelController: ModelPickerController
  onSend: (
    message: string,
    images: ImageContent[],
    behavior: StreamingBehavior,
  ) => Promise<boolean>
  onStop: () => Promise<boolean>
}) {
  const rootRef = useRef<HTMLFormElement>(null)
  const ime = useImeGuard()
  const hasParentMessages = useChatStore((s) => s.messages.some((m) => m.role === 'user'))
  const composer = useSideComposer({ rootRef, blocked, session, onSend })
  const { attachments } = composer

  return (
    <form
      ref={rootRef}
      className={styles.composer}
      data-dragging={attachments.dragging}
      onSubmit={(e) => {
        e.preventDefault()
        void composer.submit('steer')
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        attachments.setDragging(true)
      }}
      onDragLeave={() => attachments.setDragging(false)}
      onDrop={attachments.drop}
    >
      <AttachmentTray
        files={attachments.files}
        reading={attachments.reading}
        remove={attachments.remove}
        restoreText={composer.restoreText}
      />
      {attachments.error && (
        <p className={styles.attachmentError} role="alert">
          {attachments.error}
        </p>
      )}
      <textarea
        rows={1}
        aria-label="侧边聊天消息"
        placeholder="和 Piazza 聊点别的"
        value={composer.draft}
        onChange={(e) => composer.setDraft(e.target.value)}
        onPaste={attachments.paste}
        onKeyDown={(e) => {
          if (!isEnterSubmit(e) || ime.isComposing(e)) return
          e.preventDefault()
          void composer.submit(e.metaKey || e.ctrlKey ? 'followUp' : 'steer')
        }}
        {...ime.bind}
      />
      <div className={styles.composerBar}>
        <SideAttachMenu
          hasParentMessages={hasParentMessages}
          onPickFile={() => void attachments.pick(false)}
          onPickDir={() => void attachments.pick(true)}
          onQuote={composer.quote}
        />
        <TrustPicker />
        <span className={styles.spacer} />
        <ModelPicker controller={modelController} />
        <SidePrimaryButton
          running={running}
          hasContent={composer.hasContent}
          disabled={composer.sendDisabled}
          onStop={onStop}
        />
      </div>
    </form>
  )
}
