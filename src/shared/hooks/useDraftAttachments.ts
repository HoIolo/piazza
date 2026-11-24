import { useCallback, useState, type ClipboardEvent, type DragEvent, type RefObject } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import {
  attachmentFromFile,
  attachmentFromPath,
  type DraftAttachment,
} from '@/shared/api/attachments'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useNativeFileDrop } from './useNativeFileDrop'

interface AttachmentStoreAdapter {
  files: DraftAttachment[]
  append: (added: DraftAttachment[]) => void
  remove: (id: string) => void
  isCurrent?: () => boolean
}

function extractClipboardFiles(data: DataTransfer): File[] {
  const direct = Array.from(data.files)
  if (direct.length > 0) return direct
  const items: File[] = []
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) items.push(file)
  }
  return items
}

function pasteClipboard(
  event: ClipboardEvent<HTMLTextAreaElement>,
  addFiles: (files: File[]) => void,
  append: (added: DraftAttachment[]) => void,
) {
  const pastedFiles = extractClipboardFiles(event.clipboardData)
  if (pastedFiles.length) {
    event.preventDefault()
    addFiles(pastedFiles)
    return
  }
  const text = event.clipboardData.getData('text/plain')
  if (text.length < 2000 && text.split('\n').length < 30) return
  event.preventDefault()
  append([{ id: crypto.randomUUID(), name: '粘贴文本', size: new Blob([text]).size, text }])
}

async function openAttachmentPicker(
  directory: boolean,
  addPaths: (paths: string[]) => void,
  setError: (message: string) => void,
  isCurrent?: () => boolean,
) {
  const defaultPath = useAppStore.getState().currentCwd ?? undefined
  try {
    const paths = await open({ multiple: true, directory, defaultPath })
    if (!paths || (isCurrent && !isCurrent())) return
    addPaths(Array.isArray(paths) ? paths : [paths])
  } catch (reason) {
    setError(errorMessage(reason))
  }
}

function useIngestQueue(append: (added: DraftAttachment[]) => void, isCurrent?: () => boolean) {
  const [readingCount, setReadingCount] = useState(0)
  const [error, setError] = useState('')
  const ingest = useCallback(
    async (tasks: Array<() => Promise<DraftAttachment>>) => {
      setReadingCount((count) => count + 1)
      setError('')
      const results = await Promise.allSettled(tasks.map((task) => task()))
      if (!isCurrent || isCurrent()) {
        const fulfilled = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
        if (fulfilled.length) append(fulfilled)
        const failures = results.flatMap((r) =>
          r.status === 'rejected' ? [errorMessage(r.reason)] : [],
        )
        if (failures.length) setError(failures.join('；'))
      }
      setReadingCount((count) => count - 1)
    },
    [append, isCurrent],
  )
  return { reading: readingCount > 0, error, setError, ingest }
}

export function useDraftAttachments(
  root: RefObject<HTMLElement | null>,
  { files, append, remove, isCurrent }: AttachmentStoreAdapter,
) {
  const [dragging, setDragging] = useState(false)
  const { reading, error, setError, ingest } = useIngestQueue(append, isCurrent)

  const addPaths = useCallback(
    (paths: string[]) => {
      void ingest(paths.map((path) => () => attachmentFromPath(path)))
    },
    [ingest],
  )
  useNativeFileDrop(root, addPaths, setDragging)

  const addFiles = useCallback(
    (selected: File[]) => {
      void ingest(selected.map((file) => () => attachmentFromFile(file)))
    },
    [ingest],
  )

  return {
    files,
    reading,
    dragging,
    error,
    setError,
    setDragging,
    pick: (directory: boolean) => openAttachmentPicker(directory, addPaths, setError, isCurrent),
    paste: (event: ClipboardEvent<HTMLTextAreaElement>) => pasteClipboard(event, addFiles, append),
    drop: (event: DragEvent) => {
      event.preventDefault()
      setDragging(false)
      addFiles(Array.from(event.dataTransfer.files))
    },
    remove,
  }
}
