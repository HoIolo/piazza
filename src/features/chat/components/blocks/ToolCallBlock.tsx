import { useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { CodexIcon } from '@/design/icons/CodexIcon'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import { openLink } from '@/shared/utils/openLink'
import { useAppStore } from '@/store/app.store'
import type { ToolExecution } from '@/store/chat'
import { summarizeArgs, toolKind, toolVerb, type ToolKind } from './toolFormat'
import { isImageView, toolImages } from './toolImages'
import { integrationSource } from './toolIntegration'
import { ToolImageResult } from './ToolImageResult'
import { ToolDetails } from './ToolDetails'
import styles from './ToolCallBlock.module.css'

const KIND_ICONS = {
  command: 'terminal',
  read: 'file',
  search: 'search',
  list: 'folder',
  edit: 'edit',
  web: 'web',
  other: 'code',
} as const satisfies Record<ToolKind, string>

export interface ToolCallBlockProps {
  execution: ToolExecution
}

function renderLabel(source: string | null, execution: ToolExecution, running: boolean) {
  if (source) return `${running ? '正在使用' : '已使用'} ${source} 集成`
  const summary = summarizeArgs(execution.toolName, execution.args)
  const isHtml = Boolean(summary && /\.(?:html?)$/i.test(summary.trim()))
  return (
    <>
      {toolVerb(execution.toolName, running)}
      {summary && (
        <span
          className={styles.arg}
          onClick={
            isHtml
              ? (e) => {
                  e.stopPropagation()
                  void openLink(summary.trim(), useAppStore.getState().currentCwd)
                }
              : undefined
          }
        >
          {' '}
          {summary}
        </span>
      )}
    </>
  )
}

export function ToolCallBlock({ execution }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)
  const running = execution.status === 'running'
  const images = toolImages(execution)
  const source = integrationSource(execution.toolName)
  if (isImageView(execution))
    return (
      <div data-tool-call={execution.toolCallId}>
        <ToolImageResult images={images} running={running} />
      </div>
    )
  return (
    <div className={styles.block} data-tool-call={execution.toolCallId}>
      <button
        type="button"
        className={styles.line}
        data-running={running}
        onClick={() => {
          setOpened(true)
          setExpanded((value) => !value)
        }}
        aria-expanded={expanded}
      >
        <CodexIcon
          name={source ? 'integration' : KIND_ICONS[toolKind(execution.toolName)]}
          size={16}
          className={styles.icon}
        />
        <span className={styles.text}>
          <ShimmerText active={running}>{renderLabel(source, execution, running)}</ShimmerText>
        </span>
        <CodexIcon name="chevron" size={12} className={styles.chevron} />
        {execution.isError && <CircleAlert size={13} className={styles.errorIcon} />}
      </button>
      <div className={styles.detailWrap} data-expanded={expanded} inert={!expanded}>
        <div className={styles.detailClip}>
          {(expanded || opened) && <ToolDetails execution={execution} />}
        </div>
      </div>
      {images.length > 0 && <ToolImageResult images={images} running={running} />}
    </div>
  )
}
