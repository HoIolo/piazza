import { userText } from '@/shared/utils/message'
import type { ChatAssistantMessage, ChatMessage, ToolExecution } from '@/store/chat'
import { AssistantMessage } from './AssistantMessage'
import { BashExecutionItem } from './BashExecutionItem'
import { SteeredNote } from './SteeredNote'
import type { Exchange } from './exchange'
import styles from './ExchangeGroup.module.css'

/**
 * 过程区按时间排：中间轮次、直接跑的命令、运行中插进来的引导混在同一条时间线上，
 * 引导挤到最前面会让人以为它先于它要调整的那些步骤。
 */
function processItems(others: ChatMessage[], intermediate: ChatAssistantMessage[]): ChatMessage[] {
  return [...others, ...intermediate].sort((a, b) => a.timestamp - b.timestamp)
}

/** 过程区：折叠态不挂载子节点，避免数百条中间消息与工具输出拖垮会话切换 */
export function ProcessArea({
  intermediate,
  others,
  tools,
  cwd,
  active,
  visible,
  mounted,
}: Pick<Exchange, 'intermediate' | 'others'> & {
  tools: Record<string, ToolExecution>
  cwd: string | null

  active: boolean
  visible: boolean
  mounted: boolean
}) {
  return (
    <div
      className={styles.processWrap}
      data-active={active}
      data-expanded={visible}
      inert={!visible}
    >
      <div className={styles.processClip}>
        {mounted && (
          <div className={styles.process}>
            {processItems(others, intermediate).map((message, index) => {
              if (message.role === 'assistant')
                return (
                  <AssistantMessage
                    key={index}
                    message={message}
                    tools={tools}
                    cwd={cwd}
                    hideFooter
                  />
                )
              if (message.role === 'bashExecution')
                return <BashExecutionItem key={index} message={message} />
              if (message.role === 'user')
                return <SteeredNote key={index} text={userText(message)} />
              return null
            })}
          </div>
        )}
      </div>
    </div>
  )
}
