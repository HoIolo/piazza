import { useState } from 'react'
import { ArrowRight, Pencil, X } from 'lucide-react'
import type { ExtensionUiDialog } from '@/rpc/types'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import styles from './DialogCard.module.css'

export interface DialogCardProps {
  dialog: ExtensionUiDialog
  onAnswer: (payload: { value?: string; confirmed?: boolean; cancelled?: boolean }) => void
}

/** select：编号选项列表，与 Codex 的提问卡片一致 */
function SelectBody({ options, onPick }: { options: string[]; onPick: (v: string) => void }) {
  return (
    <>
      {options.map((option, index) => (
        <button key={option} type="button" className={styles.option} onClick={() => onPick(option)}>
          <span className={styles.index}>{index + 1}</span>
          <span className={styles.optionText}>{option}</span>
          <ArrowRight size={16} className={styles.go} />
        </button>
      ))}
    </>
  )
}

/** confirm：是/否两个按钮 */
function ConfirmBody({ onConfirm }: { onConfirm: (v: boolean) => void }) {
  return (
    <div className={styles.confirmRow}>
      <button type="button" className={styles.primary} onClick={() => onConfirm(true)}>
        确认
      </button>
      <button type="button" className={styles.secondary} onClick={() => onConfirm(false)}>
        取消
      </button>
    </div>
  )
}

/** input / editor：自由文本 */
function TextBody({
  multiline,
  placeholder,
  prefill,
  onSubmit,
}: {
  multiline: boolean
  placeholder?: string
  prefill?: string
  onSubmit: (v: string) => void
}) {
  const [value, setValue] = useState(prefill ?? '')
  const ime = useImeGuard()

  return (
    <div className={styles.textBody}>
      {multiline ? (
        <textarea
          className={styles.textarea}
          value={value}
          placeholder={placeholder}
          rows={5}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
      ) : (
        <input
          className={styles.input}
          value={value}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !ime.isComposing(e) && onSubmit(value)}
          {...ime.bind}
        />
      )}
      <button
        type="button"
        className={styles.primary}
        disabled={!value.trim()}
        onClick={() => onSubmit(value)}
      >
        提交
      </button>
    </div>
  )
}

/**
 * 扩展索取用户输入时的卡片，贴住输入框上方。
 * pi 的四种对话方法在这里各自呈现，但共用同一套外框与关闭行为。
 */
export function DialogCard({ dialog, onAnswer }: DialogCardProps) {
  return (
    <div className={styles.card} role="dialog" aria-label={dialog.title ?? '需要你的输入'}>
      <header className={styles.head}>
        <h4 className={styles.title}>{dialog.title ?? '需要你的输入'}</h4>
        <button
          type="button"
          className={styles.close}
          onClick={() => onAnswer({ cancelled: true })}
          aria-label="跳过"
        >
          <X size={16} />
        </button>
      </header>

      {dialog.message && <p className={styles.message}>{dialog.message}</p>}

      {dialog.method === 'select' && (
        <SelectBody options={dialog.options} onPick={(value) => onAnswer({ value })} />
      )}
      {dialog.method === 'confirm' && (
        <ConfirmBody onConfirm={(confirmed) => onAnswer({ confirmed })} />
      )}
      {(dialog.method === 'input' || dialog.method === 'editor') && (
        <TextBody
          multiline={dialog.method === 'editor'}
          placeholder={dialog.method === 'input' ? dialog.placeholder : undefined}
          prefill={dialog.method === 'editor' ? dialog.prefill : undefined}
          onSubmit={(value) => onAnswer({ value })}
        />
      )}

      <footer className={styles.foot}>
        <span className={styles.hint}>
          <Pencil size={14} />
          不选也可以直接在下方输入框告诉它该怎么做
        </span>
        <button type="button" className={styles.skip} onClick={() => onAnswer({ cancelled: true })}>
          跳过
        </button>
      </footer>
    </div>
  )
}
