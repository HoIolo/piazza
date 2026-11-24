import { useCallback, useState, type RefObject } from 'react'
import type { ImageContent, SessionState, StreamingBehavior } from '@/rpc/types'
import { prepareAttachments, type DraftAttachment } from '@/shared/api/attachments'
import { useDraftAttachments } from '@/shared/hooks/useDraftAttachments'
import { buildParentExcerpt } from './sideChatConnect'

interface SideComposerParams {
  rootRef: RefObject<HTMLFormElement | null>
  blocked: boolean
  session: SessionState | null
  onSend: (
    message: string,
    images: ImageContent[],
    behavior: StreamingBehavior,
  ) => Promise<boolean>
}

function isImageUnsupported(session: SessionState | null, count: number): boolean {
  const input = session?.model?.input
  return Boolean(count && input && !input.includes('image'))
}

/** 侧边聊天输入区状态、附件粘贴/拖拽与提交流程 */
export function useSideComposer({ rootRef, blocked, session, onSend }: SideComposerParams) {
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<DraftAttachment[]>([])
  const [sending, setSending] = useState(false)

  const append = useCallback((added: DraftAttachment[]) => setFiles((p) => [...p, ...added]), [])
  const remove = useCallback((id: string) => setFiles((p) => p.filter((f) => f.id !== id)), [])
  const attachments = useDraftAttachments(rootRef, { files, append, remove })
  const hasContent = draft.trim().length > 0 || files.length > 0
  const sendDisabled = blocked || sending || attachments.reading || !hasContent

  const quote = () => {
    const excerpt = buildParentExcerpt()
    if (excerpt) {
      setDraft((curr) => [curr.trim(), `主对话摘录：\n\n${excerpt}\n`].filter(Boolean).join('\n\n'))
    }
  }

  const restoreText = (file: DraftAttachment) => {
    if (file.text === undefined) return
    setDraft((curr) => (curr ? `${curr}\n${file.text}` : (file.text ?? '')))
    remove(file.id)
  }

  const submit = async (behavior: StreamingBehavior = 'steer') => {
    if (sendDisabled) return
    const { message, images } = prepareAttachments(draft, files)
    if (!message && !images.length) return
    if (isImageUnsupported(session, images.length)) {
      attachments.setError('当前模型不支持图片输入，请选择支持图片的模型后发送。')
      return
    }
    const [prevDraft, prevFiles] = [draft, files]
    setSending(true)
    setDraft('')
    setFiles([])
    attachments.setError('')
    const sent = await onSend(message, images, behavior)
    if (!sent) {
      setDraft((curr) => [prevDraft, curr].filter(Boolean).join('\n'))
      setFiles((curr) => [...prevFiles, ...curr])
    }
    setSending(false)
  }

  return { draft, setDraft, attachments, hasContent, sendDisabled, quote, restoreText, submit }
}
