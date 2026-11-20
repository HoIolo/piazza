import { useEffect, useId, useState, type KeyboardEvent, type RefObject } from 'react'
import type { PiCommand } from '@/rpc/types'
import { rpcClient } from '@/rpc/client'
import { useAppStore } from '@/store/app.store'
import { runRpc, useChatStore } from '@/store/chat'

interface SlashAction {
  name: string
  description?: string
  run?: () => void
}

const LOCAL_ACTIONS: SlashAction[] = [
  { name: 'new', description: '开始新对话', run: () => useAppStore.getState().startNewSession() },
  {
    name: 'compact',
    description: '压缩当前会话上下文',
    run: () => void runRpc(() => rpcClient.send({ type: 'compact' })),
  },
]

function filterCommands(commands: PiCommand[], query: string | undefined) {
  return [
    ...commands,
    ...LOCAL_ACTIONS.filter((local) => !commands.some((c) => c.name === local.name)),
  ]
    .filter(
      ({ name, description }) =>
        !query || name.toLowerCase().includes(query) || description?.toLowerCase().includes(query),
    )
    .slice(0, 20)
}

function useDismissOutside(
  open: boolean,
  draft: string,
  root: RefObject<HTMLElement | null>,
  dismiss: (value: string) => void,
) {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) dismiss(draft)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, draft, root, dismiss])
}

function slashKey(
  event: KeyboardEvent<HTMLTextAreaElement>,
  next: (delta: number) => void,
  pick: () => void,
  dismiss: () => void,
  hasItems: boolean,
) {
  if (event.key === 'Escape') {
    event.preventDefault()
    dismiss()
    return true
  }
  const modified = (['Alt', 'Control', 'Meta', 'Shift'] as const).some((key) =>
    event.getModifierState(key),
  )
  if (!hasItems || modified) return false
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    pick()
    return true
  }
  const delta = { ArrowUp: -1, ArrowDown: 1 }[event.key]
  if (delta === undefined) return false
  event.preventDefault()
  next(delta)
  return true
}

export function useSlashMenu(
  draft: string,
  enabled: boolean,
  commands: PiCommand[],
  root: RefObject<HTMLElement | null>,
  replaceDraft: (draft: string) => void,
) {
  const id = useId()
  const [dismissed, setDismissed] = useState<string>()
  const [position, setPosition] = useState<{ text: string; index: number }>()
  const query = /^\/([\p{L}\p{N}_.:-]*)$/u.exec(draft)?.[1]?.toLowerCase()
  const ready = useChatStore(
    (state) => !!state.session && !state.sessionLoading && !state.isStreaming,
  )
  const open = ready && enabled && query !== undefined && dismissed !== draft
  const items = filterCommands(commands, query)
  const index =
    position?.text === draft ? Math.min(position.index, Math.max(0, items.length - 1)) : 0
  useDismissOutside(open, draft, root, setDismissed)

  const pick = (item: SlashAction) => {
    if (item.run) {
      replaceDraft('')
      item.run()
    } else {
      replaceDraft(`/${item.name} `)
    }
  }

  return {
    id,
    open,
    items,
    index,
    pick,
    reset: () => setDismissed(undefined),
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) =>
      open &&
      slashKey(
        event,
        (delta) =>
          setPosition({ text: draft, index: (index + delta + items.length) % items.length }),
        () => pick(items[index]),
        () => setDismissed(draft),
        Boolean(items.length),
      ),
  }
}
