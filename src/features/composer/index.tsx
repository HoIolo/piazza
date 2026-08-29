import { useRef, type KeyboardEvent } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { useAutoResize } from '@/shared/hooks/useAutoResize'
import { useImeGuard } from '@/shared/hooks/useImeGuard'
import { relativeTo } from '@/shared/utils/path'
import { useAppStore } from '@/store/app.store'
import { useChatActions, useChatStore } from '@/store/chat'
import { ComposerToolbar } from './components/ComposerToolbar'
import { ContextBar } from './components/ContextBar'
import { MentionPanel } from './components/MentionPanel'
import { useMentionItems } from './hooks/useMentionItems'
import { useMentionPanel } from './hooks/useMentionPanel'
import styles from './Composer.module.css'

export interface ComposerProps {
  projectName: string
  branch: string | null
  /** 空状态才显示上下文条 */
  showContextBar: boolean
}

export function Composer({ projectName, branch, showContextBar }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const draft = useChatStore((s) => s.draft)
  const setDraft = useChatStore((s) => s.setDraft)
  const cwd = useAppStore((s) => s.currentCwd)
  const { sendPrompt, abort, isStreaming } = useChatActions()

  const panel = useMentionPanel({ draft, setDraft, textareaRef, rootRef })
  const groups = useMentionItems(cwd, panel.query)
  const ime = useImeGuard()

  useAutoResize(textareaRef, draft)

  const submit = () => {
    /*
     * 从 store 现取，不用闭包里的 draft。
     *
     * 连按两次回车时，第二次 keydown 往往发生在 React 重渲染之前，
     * 此时闭包捕获的 draft 还是旧值，同一条就被发了两遍。
     * zustand 的 set 是同步的，getState() 立刻能读到已清空的草稿。
     */
    const text = useChatStore.getState().draft
    if (!text.trim()) return
    void sendPrompt(text)
    setDraft('')
    panel.close()
  }

  const pickFromDisk = async (directory: boolean) => {
    panel.close()
    const picked = await open({ multiple: true, directory, defaultPath: cwd ?? undefined })
    if (!picked) return
    const paths = (Array.isArray(picked) ? picked : [picked]).map((p) => relativeTo(p, cwd))
    panel.appendText(paths.join(' '))
  }

  // Enter 发送、Shift+Enter 换行；输入法组合期间的 Enter 必须放行，
  // 否则中文选词会被误当作发送
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape' && panel.open) {
      panel.close()
      return
    }
    if (e.key !== 'Enter' || e.shiftKey || ime.isComposing(e)) return
    e.preventDefault()
    submit()
  }

  return (
    <div className={styles.composer} ref={rootRef}>
      {showContextBar && <ContextBar projectName={projectName} branch={branch} />}
      <div className={styles.box}>
        {panel.open && (
          <div className={styles.panelLayer}>
            <MentionPanel
              groups={groups}
              query={panel.query}
              /* @ 触发时关键词跟着输入框走，面板不再自带搜索框 */
              onQueryChange={panel.fromMention ? undefined : panel.setAttachQuery}
              onPickFromDisk={panel.fromMention ? undefined : (dir) => void pickFromDisk(dir)}
              onPick={(item) => panel.pick(item.insert)}
            />
          </div>
        )}

        <textarea
          ref={textareaRef}
          className={styles.input}
          placeholder="随心输入"
          value={draft}
          rows={1}
          onChange={(e) => {
            setDraft(e.target.value)
            panel.syncFromInput(e.target.value, e.target.selectionStart)
          }}
          onKeyDown={handleKeyDown}
          {...ime.bind}
        />
        <ComposerToolbar
          canSend={draft.trim().length > 0}
          isStreaming={isStreaming}
          onSend={submit}
          onAbort={() => void abort()}
          attachOpen={panel.attachOpen}
          onToggleAttach={panel.toggleAttach}
        />
      </div>
    </div>
  )
}
