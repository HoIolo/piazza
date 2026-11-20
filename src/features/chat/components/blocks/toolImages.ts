import type { ToolExecution } from '@/store/chat'

export function toolImages(execution: ToolExecution) {
  return (
    (execution.result ?? execution.partialResult)?.content.filter(
      (block) => block.type === 'image',
    ) ?? []
  )
}

/** 图片查看独立成行，不与 Shell/文件读取的过程分组合并。 */
export function isImageView(execution: ToolExecution) {
  if (execution.isError || execution.toolName.startsWith('mcp__')) return false
  const name = execution.toolName.split('__').pop() ?? execution.toolName
  if (/^(view_image|open_image|read_image)$/.test(name)) return true
  const content = (execution.result ?? execution.partialResult)?.content
  return Boolean(content?.length && content.every((block) => block.type === 'image'))
}

export function toolRuns(executions: ToolExecution[]) {
  const runs: ToolExecution[][] = []
  for (const execution of executions) {
    const previous = runs[runs.length - 1]
    if (isImageRun(execution) || !previous || isImageRun(previous[0])) runs.push([execution])
    else previous.push(execution)
  }
  return runs
}

function isImageRun(execution: ToolExecution) {
  return isImageView(execution) || toolImages(execution).length > 0
}
