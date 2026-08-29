import type { ToolExecution } from '@/store/chat'
import type { TextContent } from '@/rpc/types'

/** 从工具参数里提取一行摘要，用于折叠态展示 */
export function summarizeArgs(toolName: string, args: Record<string, unknown>): string {
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = args[key]
      if (typeof value === 'string' && value.trim()) return value
    }
    return null
  }

  const summary =
    toolName === 'bash'
      ? pick('command')
      : pick('file_path', 'path', 'filePath', 'pattern', 'query', 'url')

  if (summary) return summary.replace(/\s+/g, ' ').slice(0, 160)

  const keys = Object.keys(args)
  return keys.length > 0 ? keys.join(', ') : ''
}

/** 把工具结果的内容块拼成可显示的纯文本 */
export function resultToText(execution: ToolExecution): string {
  const result = execution.result ?? execution.partialResult
  if (!result) return ''
  return result.content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

/**
 * 工具名到中文动词的映射，分进行时与完成时两态。
 * 未收录的工具退回原名，形如「正在 mytool」/「已 mytool」。
 */
const TOOL_VERBS: Record<string, { running: string; done: string }> = {
  bash: { running: '正在运行', done: '已运行' },
  read: { running: '正在读取', done: '已读取' },
  write: { running: '正在写入', done: '已写入' },
  edit: { running: '正在编辑', done: '已编辑' },
  glob: { running: '正在查找', done: '已查找' },
  grep: { running: '正在搜索', done: '已搜索' },
  list: { running: '正在列出', done: '已列出' },
  fetch: { running: '正在请求', done: '已请求' },
  todo: { running: '正在更新清单', done: '已更新清单' },
}

/** 折叠行左侧的动词，如「正在运行」「已运行」 */
export function toolVerb(toolName: string, running: boolean): string {
  const verbs = TOOL_VERBS[toolName]
  if (verbs) return running ? verbs.running : verbs.done
  return running ? `正在 ${toolName}` : `已 ${toolName}`
}

/** 展开卡片的标题，如 bash 对应「Shell」 */
const TOOL_TITLES: Record<string, string> = {
  bash: 'Shell',
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  glob: '查找文件',
  grep: '搜索内容',
  list: '列出目录',
}

export function toolTitle(toolName: string): string {
  return TOOL_TITLES[toolName] ?? toolName
}
