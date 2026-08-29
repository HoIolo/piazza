import { ArrowUp, Square } from 'lucide-react'
import { AttachButton } from './AttachMenu'
import { ModelPicker } from './ModelPicker'
import { TrustPicker } from './TrustPicker'
import styles from './ComposerToolbar.module.css'

export interface ComposerToolbarProps {
  canSend: boolean
  isStreaming: boolean
  onSend: () => void
  onAbort: () => void
  /** 「+」面板是否展开 */
  attachOpen: boolean
  onToggleAttach: () => void
}

/** 输入框底部工具条 */
export function ComposerToolbar({
  canSend,
  isStreaming,
  onSend,
  onAbort,
  attachOpen,
  onToggleAttach,
}: ComposerToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <AttachButton open={attachOpen} onToggle={onToggleAttach} />
      <TrustPicker />

      <div className={styles.right}>
        <ModelPicker />
        <button
          type="button"
          className={styles.send}
          data-streaming={isStreaming}
          disabled={!isStreaming && !canSend}
          onClick={isStreaming ? onAbort : onSend}
          aria-label={isStreaming ? '停止生成' : '发送'}
        >
          {isStreaming ? <Square size={13} fill="currentColor" /> : <ArrowUp size={17} />}
        </button>
      </div>
    </div>
  )
}
