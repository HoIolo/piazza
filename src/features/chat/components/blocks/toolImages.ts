import type { ToolExecution } from '@/store/chat'

const IMAGE_PATH_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|tiff?|heic)$/i

function hasImagePathArg(args: Record<string, unknown>): boolean {
  for (const key of ['path', 'file_path', 'filePath', 'file']) {
    const val = args[key]
    if (typeof val === 'string' && IMAGE_PATH_RE.test(val.trim())) return true
  }
  return false
}

export function toolImages(execution: ToolExecution) {
  return (
    (execution.result ?? execution.partialResult)?.content.filter(
      (block) => block.type === 'image',
    ) ?? []
  )
}

/**
 * 图片查看独立成行，直接渲染为「正在查看图像 / 已查看 N 张图像」，
 * 不再额外挂一行「已读取 xxx.png」（pi 的 read 读取图片时会同时返回 text 说明与 image 块）。
 */
export function isImageView(execution: ToolExecution) {
  if (execution.isError || execution.toolName.startsWith('mcp__')) return false
  const name = execution.toolName.split('__').pop() ?? execution.toolName
  if (/^(view_image|open_image|read_image)$/.test(name)) return true
  if (toolImages(execution).length > 0) return true
  return name === 'read' && execution.status === 'running' && hasImagePathArg(execution.args)
}

/**
 * 把一串执行按「看的是一类东西」切成若干段。
 *
 * 看图单独成段：它的展开项是缩略图而不是命令行，和读写类混在一起会让分组头
 * 的「已读取 N 个……运行 N 条命令」对不上账。相邻的几次看图合在一段里——
 * Codex 把连续活动收成一条汇总（读几个文件、跑几条命令），看三张图也不该占三行。
 */
export function toolRuns(executions: ToolExecution[]) {
  const runs: ToolExecution[][] = []
  let images: ToolExecution[] | null = null
  for (const execution of executions) {
    if (isImageView(execution)) {
      if (images) images.push(execution)
      else runs.push((images = [execution]))
      continue
    }
    images = null
    const previous = runs[runs.length - 1]
    if (!previous || isImageView(previous[0])) runs.push([execution])
    else previous.push(execution)
  }
  return runs
}
