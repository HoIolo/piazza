import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { sideRpcClient } from '@/rpc/client'
import type {
  ExtensionUiResponse,
  ImageContent,
  RpcCommand,
  SessionState,
  StreamingBehavior,
} from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { reduceEvent } from '@/store/chat/reducer'
import { sessionMetadataPatch } from '@/store/chat/sessionMetadata'
import { buildLocalEcho } from '@/store/chat/storeBuilders'
import { emptySnapshot, type ChatSnapshot } from '@/store/chat/types'
import { buildSideModelController, connectSideSlot } from './sideChatConnect'

type SideStatus = 'starting' | 'ready' | 'disconnected'

function useSidePrompt(
  isStreaming: boolean,
  send: (command: RpcCommand) => Promise<boolean>,
  setSnapshot: Dispatch<SetStateAction<ChatSnapshot>>,
) {
  const streamingRef = useRef(false)
  useEffect(() => {
    streamingRef.current = isStreaming
  }, [isStreaming])

  return useCallback(
    async (message: string, images: ImageContent[], behavior: StreamingBehavior) => {
      const running = streamingRef.current
      const type = !running ? 'prompt' : behavior === 'steer' ? 'steer' : 'follow_up'
      const localId = type === 'prompt' || type === 'steer' ? crypto.randomUUID() : null
      if (localId) {
        const echo = buildLocalEcho(message, images, localId, type === 'steer')
        setSnapshot((s) => ({ ...s, messages: [...s.messages, echo] }))
      }
      const ok = await send({ type, message, ...(images.length ? { images } : {}) })
      if (!ok && localId) {
        setSnapshot((s) => ({ ...s, messages: s.messages.filter((m) => m.localId !== localId) }))
      }
      return ok
    },
    [send, setSnapshot],
  )
}

function useSideRpcActions(
  slotId: string,
  setError: Dispatch<SetStateAction<string>>,
  setSnapshot: Dispatch<SetStateAction<ChatSnapshot>>,
) {
  const send = useCallback(
    async (command: RpcCommand): Promise<boolean> => {
      setError('')
      try {
        await sideRpcClient.send(command, slotId)
        return true
      } catch (reason) {
        setError(errorMessage(reason))
        return false
      }
    },
    [slotId, setError],
  )

  const answer = useCallback(
    async (id: string, payload: Omit<ExtensionUiResponse, 'type' | 'id'>) => {
      setError('')
      try {
        await sideRpcClient.notify({ type: 'extension_ui_response', id, ...payload }, slotId)
        setSnapshot((s) => (s.pendingDialog?.id === id ? { ...s, pendingDialog: null } : s))
      } catch (reason) {
        setError(errorMessage(reason))
      }
    },
    [slotId, setError, setSnapshot],
  )

  return { send, answer }
}

export function useSideChatSession(cwd: string, slotId: string, onReconnect: () => void) {
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [session, setSession] = useState<SessionState | null>(null)
  const [status, setStatus] = useState<SideStatus>('starting')
  const [error, setError] = useState('')

  useEffect(() => {
    return connectSideSlot(
      cwd,
      slotId,
      (event) => {
        setSession((curr) => sessionMetadataPatch(curr, event)?.session ?? curr)
        setSnapshot((s) => reduceEvent(s, event))
      },
      (state) => {
        setSession(state)
        setStatus('ready')
        setError('')
      },
      (msg) => {
        setStatus('disconnected')
        setError(msg)
      },
    )
  }, [cwd, slotId])

  const { send, answer } = useSideRpcActions(slotId, setError, setSnapshot)
  const sendPrompt = useSidePrompt(snapshot.isStreaming, send, setSnapshot)

  const modelController = useMemo(
    () => buildSideModelController({ slotId, session, status, send, setSession, onReconnect }),
    [slotId, session, status, send, onReconnect],
  )

  return {
    snapshot,
    session,
    status,
    error: error || snapshot.error?.message,
    send,
    sendPrompt,
    answer,
    modelController,
  }
}
