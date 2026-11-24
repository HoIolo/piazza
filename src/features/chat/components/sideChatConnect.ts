import { sideRpcClient } from '@/rpc/client'
import type {
  AgentEvent,
  AvailableModels,
  AvailableThinkingLevels,
  RpcCommand,
  SessionState,
  ThinkingLevel,
} from '@/rpc/types'
import type { ModelPickerController } from '@/shared/components/ModelPicker'
import { errorMessage } from '@/shared/utils/error'
import { userText } from '@/shared/utils/message'
import { useChatStore } from '@/store/chat/store'

export const SIDE_MODEL_TIMEOUT_MS = 10_000
const lifecycles = new Map<string, Promise<void>>()

function enqueue(slotId: string, work: () => Promise<void>) {
  const prev = lifecycles.get(slotId) ?? Promise.resolve()
  const next = prev.then(work).catch((reason: unknown) => {
    console.error('侧边聊天进程操作失败', reason)
  })
  lifecycles.set(slotId, next)
}

async function startAndFetchState(cwd: string, slotId: string): Promise<SessionState> {
  const initialModel = useChatStore.getState().session?.model
  await sideRpcClient.start(
    { cwd, provider: initialModel?.provider, model: initialModel?.id, ephemeral: true },
    slotId,
  )
  return sideRpcClient.send<SessionState>({ type: 'get_state' }, slotId, 20_000)
}

export function connectSideSlot(
  cwd: string,
  slotId: string,
  onEvent: (event: AgentEvent) => void,
  onReady: (state: SessionState) => void,
  onFail: (error: string) => void,
) {
  let cancelled = false
  let exited = false
  let unsubscribe: (() => void) | undefined

  enqueue(slotId, async () => {
    if (cancelled) return
    const offEvent = sideRpcClient.onEvent((event, source) => {
      if (source === slotId) onEvent(event)
    })
    const offExit = sideRpcClient.onExit((info, source) => {
      if (source !== slotId) return
      exited = true
      onFail(info.stderr.trim() || '侧边聊天进程已退出')
    })
    unsubscribe = () => {
      offEvent()
      offExit()
    }
    try {
      const state = await startAndFetchState(cwd, slotId)
      if (!cancelled && !exited) onReady(state)
    } catch (reason) {
      if (!cancelled && !exited) onFail(errorMessage(reason))
    }
  })

  return () => {
    cancelled = true
    if (!unsubscribe) return
    unsubscribe()
    enqueue(slotId, () => sideRpcClient.stop(slotId))
  }
}

export function buildSideModelController(params: {
  slotId: string
  session: SessionState | null
  status: 'starting' | 'ready' | 'disconnected'
  send: (command: RpcCommand) => Promise<boolean>
  setSession: (state: SessionState) => void
  onReconnect: () => void
}): ModelPickerController {
  const { slotId, session, status, send, setSession, onReconnect } = params
  const syncState = async () => {
    const next = await sideRpcClient
      .send<SessionState>({ type: 'get_state' }, slotId, SIDE_MODEL_TIMEOUT_MS)
      .catch(() => null)
    if (next) setSession(next)
  }
  return {
    session,
    rpcReady: status === 'ready',
    loading: status === 'starting',
    fetchModels: () =>
      sideRpcClient.send<AvailableModels>(
        { type: 'get_available_models' },
        slotId,
        SIDE_MODEL_TIMEOUT_MS,
      ),
    fetchLevels: () =>
      sideRpcClient.send<AvailableThinkingLevels>(
        { type: 'get_available_thinking_levels' },
        slotId,
        SIDE_MODEL_TIMEOUT_MS,
      ),
    setModel: async (provider, modelId) => {
      if (await send({ type: 'set_model', provider, modelId })) await syncState()
    },
    setThinkingLevel: async (level: ThinkingLevel) => {
      if (await send({ type: 'set_thinking_level', level })) await syncState()
    },
    onReconnect,
  }
}

export function buildParentExcerpt(): string {
  return useChatStore
    .getState()
    .messages.filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-4)
    .map((m) => {
      if (m.role === 'user') return `提问：${userText(m).slice(-1500)}`
      if (m.role !== 'assistant') return ''
      const text = m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n')
      return text ? `回答：${text.slice(-1500)}` : ''
    })
    .filter(Boolean)
    .join('\n\n')
}
