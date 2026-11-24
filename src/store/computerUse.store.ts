import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { create } from 'zustand'
import { rpcClient } from '@/rpc/client'
import {
  listCuWindows,
  type ControlledWindow,
  type CuFramePayload,
} from '@/shared/api/computerUse'
import { useChatStore } from './chat/store'

export interface PreviewFrame {
  src: string
  width: number
  height: number
}

export interface PreviewPosition {
  x: number
  y: number
}

interface ComputerUseStore {
  windows: ControlledWindow[]
  frames: Record<number, PreviewFrame>
  focusedWindowId: number | null
  previewOpen: boolean
  expanded: boolean
  position: PreviewPosition | null

  applyWindows: (next: ControlledWindow[]) => void
  applyFrame: (frame: CuFramePayload) => void
  focusCard: (windowId: number) => void
  setPreviewOpen: (open: boolean) => void
  setExpanded: (expanded: boolean) => void
  setPosition: (position: PreviewPosition | null) => void
}

function retainFrames(
  prev: Record<number, PreviewFrame>,
  windows: ControlledWindow[],
): Record<number, PreviewFrame> {
  const validIds = new Set(windows.map((w) => w.windowId))
  const next: Record<number, PreviewFrame> = {}
  for (const [id, frame] of Object.entries(prev)) {
    const num = Number(id)
    if (validIds.has(num)) next[num] = frame
  }
  return next
}

function shouldAutoOpen(prev: ControlledWindow[], next: ControlledWindow[]): boolean {
  if (next.length === 0) return false
  const prevActiveById = new Map(prev.map((w) => [w.windowId, w.active]))
  return next.some((w) => {
    const existed = prevActiveById.has(w.windowId)
    const wasActive = prevActiveById.get(w.windowId) ?? false
    return (!existed && w.active) || (!wasActive && w.active)
  })
}

function resolveFocusedId(
  current: number | null,
  next: ControlledWindow[],
): number | null {
  if (next.length === 0) return null
  if (current !== null && next.some((w) => w.windowId === current)) return current
  return next[0].windowId
}

export const useComputerUseStore = create<ComputerUseStore>((set) => ({
  windows: [],
  frames: {},
  focusedWindowId: null,
  previewOpen: false,
  expanded: false,
  position: null,

  applyWindows: (next) =>
    set((state) => ({
      windows: next,
      frames: retainFrames(state.frames, next),
      focusedWindowId: resolveFocusedId(state.focusedWindowId, next),
      previewOpen: next.length === 0 ? false : shouldAutoOpen(state.windows, next) || state.previewOpen,
      expanded: next.length <= 1 ? false : state.expanded,
    })),

  applyFrame: (frame) =>
    set((state) => ({
      frames: {
        ...state.frames,
        [frame.windowId]: {
          src: `data:${frame.mimeType};base64,${frame.data}`,
          width: frame.width,
          height: frame.height,
        },
      },
    })),

  focusCard: (windowId) => set({ focusedWindowId: windowId }),
  setPreviewOpen: (previewOpen) => set({ previewOpen }),
  setExpanded: (expanded) => set({ expanded }),
  setPosition: (position) => set({ position }),
}))

let bindPromise: Promise<void> | undefined

async function registerListeners(): Promise<void> {
  const unlisteners: UnlistenFn[] = []
  try {
    const onState = listen<ControlledWindow[]>('piazza://cu-state', ({ payload }) => {
      useComputerUseStore.getState().applyWindows(payload)
    })
    const onFrame = listen<CuFramePayload>('piazza://cu-frame', ({ payload }) => {
      useComputerUseStore.getState().applyFrame(payload)
    })
    const onStop = listen('piazza://cu-stop-requested', () => {
      if (useChatStore.getState().isStreaming) {
        void rpcClient.send({ type: 'abort' }).catch(() => undefined)
      }
    })
    unlisteners.push(...(await Promise.all([onState, onFrame, onStop])))
    const initial = await listCuWindows().catch(() => [])
    if (initial.length > 0) useComputerUseStore.getState().applyWindows(initial)
  } catch {
    unlisteners.forEach((off) => off())
    bindPromise = undefined
  }
}

/** 绑定来自 Rust 侧的 Computer Use 状态、实时画面与停止事件 */
export function bindComputerUseEvents(): Promise<void> {
  return (bindPromise ??= registerListeners())
}
