import { useCallback, useState, type ClipboardEvent, type DragEvent, type RefObject } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { attachmentFromFile, attachmentFromPath } from '@/shared/api/attachments'
import { errorMessage } from '@/shared/utils/error'
import { useChatStore } from '@/store/chat'
import { useAppStore } from '@/store/app.store'
import { useAttachmentIngest } from './useAttachmentIngest'
import { useNativeFileDrop } from './useNativeFileDrop'

export function useAttachments(root: RefObject<HTMLElement | null>) {
  const files = useChatStore((state) => state.attachments)
  const [dragging, setDragging] = useState(false)
  const { reading, error, setError, ingest } = useAttachmentIngest()
  const addPaths = useCallback(
    (paths: string[]) => {
      void ingest(paths.map((path) => () => attachmentFromPath(path)))
    },
    [ingest],
  )
  useNativeFileDrop(root, addPaths, setDragging)
  const addFiles = (selected: File[]) => {
    void ingest(selected.map((file) => () => attachmentFromFile(file)))
  }
  const pick = (directory: boolean) => pickAttachments(directory, addPaths, setError)
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }
  return {
    files,
    reading,
    dragging,
    error,
    pick,
    paste: (event: ClipboardEvent<HTMLTextAreaElement>) => pasteAttachments(event, addFiles),
    drop,
    setDragging,
    remove: (id: string) => {
      const store = useChatStore.getState()
      store.setAttachments(store.attachments.filter((file) => file.id !== id))
    },
  }
}

function pasteAttachments(
  event: ClipboardEvent<HTMLTextAreaElement>,
  addFiles: (files: File[]) => void,
) {
  const pastedFiles = Array.from(event.clipboardData.files)
  if (pastedFiles.length) {
    event.preventDefault()
    addFiles(pastedFiles)
    return
  }
  const text = event.clipboardData.getData('text/plain')
  if (text.length < 2000 && text.split('\n').length < 30) return
  event.preventDefault()
  const store = useChatStore.getState()
  store.setAttachments([
    ...store.attachments,
    { id: crypto.randomUUID(), name: '粘贴文本', size: new Blob([text]).size, text },
  ])
}

async function pickAttachments(
  directory: boolean,
  addPaths: (paths: string[]) => void,
  setError: (message: string) => void,
) {
  const { sessionNonce, currentCwd } = useAppStore.getState()
  try {
    const paths = await open({ multiple: true, directory, defaultPath: currentCwd ?? undefined })
    if (!paths || useAppStore.getState().sessionNonce !== sessionNonce) return
    addPaths(Array.isArray(paths) ? paths : [paths])
  } catch (reason) {
    setError(errorMessage(reason))
  }
}
