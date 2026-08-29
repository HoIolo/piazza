import { useCallback, useEffect, useState, type RefObject } from 'react'
import { detectMention, replaceMention, type MentionContext } from '../mention'

interface Options {
  draft: string
  setDraft: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** 面板与输入区所在的容器，用于判定「点到了外面」 */
  rootRef: RefObject<HTMLElement | null>
}

/**
 * 提及面板的开合与文本写入。
 *
 * 面板有两个入口——点「+」和在输入框里打 @——但共用同一块浮层，
 * 因此开合状态必须集中在一处，否则两条路径会各开各的。
 */
export function useMentionPanel({ draft, setDraft, textareaRef, rootRef }: Options) {
  const [mention, setMention] = useState<MentionContext | null>(null)
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachQuery, setAttachQuery] = useState('')

  const open = attachOpen || mention !== null
  const query = mention?.query ?? attachQuery

  // 三个 setter 都是稳定引用，close 因而也稳定，可安全用于事件监听
  const close = useCallback(() => {
    setAttachOpen(false)
    setAttachQuery('')
    setMention(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, rootRef, close])

  /** 追加到末尾，供「+」面板与系统选择器使用 */
  const appendText = (text: string) => {
    setDraft(draft ? `${draft.replace(/\s*$/, '')} ${text} ` : `${text} `)
    textareaRef.current?.focus()
  }

  /** 替换掉输入框里的 @关键词 */
  const replaceMentionWith = (insert: string) => {
    const el = textareaRef.current
    if (!mention || !el) return
    const next = replaceMention(draft, mention, el.selectionStart, insert)
    setDraft(next.text)
    // 等 React 写入 value 后再摆光标，否则会被这次渲染覆盖回末尾
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
  }

  return {
    open,
    query,
    /** 来源是 @ 时，关键词与插入位置都由输入框决定 */
    fromMention: mention !== null,
    attachOpen,
    close,
    toggleAttach: () => (attachOpen ? close() : setAttachOpen(true)),
    setAttachQuery,
    /** 输入变化时重新判断光标是否落在一个 @ 提及里 */
    syncFromInput: (value: string, caret: number) => setMention(detectMention(value, caret)),
    pick: (insert: string) => {
      if (mention) replaceMentionWith(insert)
      else appendText(insert)
      close()
    },
    appendText,
  }
}
