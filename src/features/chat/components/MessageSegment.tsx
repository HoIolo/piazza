import type { ToolExecution } from '@/store/chat'
import { Markdown } from '@/shared/components/Markdown'
import { MessageImages } from '@/shared/components/ImagePreview'
import { ToolGroup } from './blocks/ToolGroup'
import type { MessageSegment as Segment } from './messageSegments'

export function MessageSegment({
  segment,
  tools,
  cwd,
  caret,
  thinking = null,
}: {
  segment: Segment
  tools: Record<string, ToolExecution>
  cwd: string | null
  caret: boolean
  thinking?: string | null
}) {
  if (segment.kind === 'text')
    return (
      <Markdown caret={caret} cwd={cwd}>
        {segment.text}
      </Markdown>
    )
  if (segment.kind === 'image') return <MessageImages images={[segment.image]} />
  return (
    <ToolGroup
      executions={segment.ids.flatMap((id) => (tools[id] ? [tools[id]] : []))}
      thinking={thinking}
    />
  )
}
