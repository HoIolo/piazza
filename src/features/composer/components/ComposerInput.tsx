import type { ClipboardEventHandler, KeyboardEventHandler, RefObject } from 'react'
import type { useImeGuard } from '@/shared/hooks/useImeGuard'
import type { useMentionPanel } from '../hooks/useMentionPanel'
import type { useMentionItems } from '../hooks/useMentionItems'
import type { useSlashMenu } from '../hooks/useSlashMenu'
import { MentionPanel } from './MentionPanel'
import { SlashMenu } from './SlashMenu'
import styles from '../Composer.module.css'

interface Props {
  draft: string
  setDraft: (text: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  panel: ReturnType<typeof useMentionPanel>
  groups: ReturnType<typeof useMentionItems>
  slash: ReturnType<typeof useSlashMenu>
  ime: ReturnType<typeof useImeGuard>
  placeholder: string
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>
  onPickFromDisk: (directory: boolean) => void
}

export function ComposerInput({
  draft,
  setDraft,
  textareaRef,
  panel,
  groups,
  slash,
  ime,
  placeholder,
  onPaste,
  onKeyDown,
  onPickFromDisk,
}: Props) {
  return (
    <>
      {slash.open && (
        <div className={styles.panelLayer}>
          <SlashMenu {...slash} />
        </div>
      )}
      {panel.open && (
        <div className={styles.panelLayer}>
          <MentionPanel
            groups={groups}
            query={panel.query}
            onQueryChange={panel.fromMention ? undefined : panel.setAttachQuery}
            onPickFromDisk={panel.fromMention ? undefined : onPickFromDisk}
            onPick={(item) => panel.pick(item.insert)}
          />
        </div>
      )}
      <textarea
        ref={textareaRef}
        className={styles.input}
        placeholder={placeholder}
        value={draft}
        rows={2}
        aria-controls={slash.open ? slash.id : undefined}
        aria-activedescendant={
          slash.open && slash.items.length ? `${slash.id}-${slash.index}` : undefined
        }
        onChange={(event) => {
          slash.reset()
          setDraft(event.target.value)
          panel.syncFromInput(event.target.value, event.target.selectionStart)
        }}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        {...ime.bind}
      />
    </>
  )
}
