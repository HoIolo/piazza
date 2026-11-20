import { EmptyState } from './EmptyState'
import { MessageList } from './MessageList'
import { MessageListSkeleton } from './MessageListSkeleton'

export interface ChatBodyProps {
  loading: boolean
  empty: boolean
  projectName: string
  onPickSuggestion: (text: string) => void
}

/** 会话列正文三态：读取中出骨架，空会话出引导页，否则是消息流 */
export function ChatBody({ loading, empty, projectName, onPickSuggestion }: ChatBodyProps) {
  if (loading) return <MessageListSkeleton />
  if (empty) return <EmptyState projectName={projectName} onPickSuggestion={onPickSuggestion} />
  return <MessageList />
}
