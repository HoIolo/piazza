import type { AgentEvent, SessionState } from '@/rpc/types'
import type { ChatSnapshot } from './types'

type SessionMetadata = Pick<ChatSnapshot, 'titlePending' | 'previewName'> & {
  session: SessionState | null
}

export function sessionMetadataPatch(
  session: SessionState | null,
  event: AgentEvent,
): Partial<SessionMetadata> | undefined {
  if (event.type === 'piazza_title_pending') return { titlePending: event.pending }
  if (event.type !== 'session_info_changed') return
  return {
    session: session && { ...session, sessionName: event.name },
    previewName: event.name ?? null,
  }
}
