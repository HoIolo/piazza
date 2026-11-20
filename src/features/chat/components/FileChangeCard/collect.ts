import type { ChatAssistantMessage, ToolExecution } from '@/store/chat'
import type { FileChange } from './index'

/** 会产生文件改动的工具 */
const MUTATING_TOOLS = new Set(['edit', 'write', 'multi_edit', 'apply_patch', 'create'])

/** 从工具参数里取出被改动的文件路径 */
function pathOf(args: Record<string, unknown>): string | null {
  for (const key of ['file_path', 'filePath', 'path', 'file']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/** 读取一个可能存在的数值字段 */
function numberAt(source: Record<string, unknown> | undefined, keys: string[]): number {
  if (!source) return 0
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

/**
 * 汇总本轮所有文件改动。
 *
 * 增删行数取自工具结果的 details——不同工具字段名不统一，这里做兼容取值；
 * 取不到时按 0 计，宁可少显示数字也不猜测，避免展示错误的统计。
 */
export function collectFileChanges(tools: Record<string, ToolExecution>): FileChange[] {
  const byPath = new Map<string, FileChange>()

  for (const execution of Object.values(tools)) {
    if (!MUTATING_TOOLS.has(execution.toolName) || execution.isError) continue

    const path = pathOf(execution.args)
    if (!path) continue

    const details = execution.result?.details
    const additions = numberAt(details, ['additions', 'added', 'linesAdded'])
    const deletions = numberAt(details, ['deletions', 'removed', 'linesRemoved'])

    const existing = byPath.get(path)
    if (existing) {
      existing.additions += additions
      existing.deletions += deletions
    } else {
      byPath.set(path, { path, additions, deletions })
    }
  }

  return [...byPath.values()]
}

/** 把绝对路径转成相对工作目录的展示路径 */
export function relativize(path: string, cwd: string | null): string {
  if (!cwd || !path.startsWith(cwd)) return path
  return path.slice(cwd.length).replace(/^\//, '')
}

/**
 * 一次交互里的文件改动，路径已转成相对项目根。
 *
 * tools 是整个会话的执行表，直接拿去汇总会把之前每一轮的改动都算进来——
 * 于是每条回答下面都挂着同一张越来越长的卡片。这里只挑本次交互发起的调用。
 */
export function exchangeFileChanges(
  messages: ChatAssistantMessage[],
  tools: Record<string, ToolExecution>,
  cwd: string | null,
): FileChange[] {
  const own: Record<string, ToolExecution> = {}
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type === 'toolCall' && tools[block.id]) own[block.id] = tools[block.id]
    }
  }
  return collectFileChanges(own).map((change) => ({
    ...change,
    path: relativize(change.path, cwd),
  }))
}
