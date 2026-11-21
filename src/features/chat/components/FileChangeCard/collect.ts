import type { ChatAssistantMessage, ToolExecution } from '@/store/chat'
import { countDiffLines } from '@/shared/utils/diff'
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
function numberAt(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function resultChange(path: string, details: Record<string, unknown> = {}): FileChange {
  const diff = typeof details.patch === 'string' ? details.patch : details.diff
  if (typeof diff === 'string') return { path, diff, ...countDiffLines(diff) }
  return {
    path,
    diff: '',
    additions: numberAt(details, ['additions', 'added', 'linesAdded']),
    deletions: numberAt(details, ['deletions', 'removed', 'linesRemoved']),
  }
}

function sum(a: number | null, b: number | null) {
  return a === null || b === null ? null : a + b
}

export function collectFileChanges(
  tools: Record<string, ToolExecution>,
  cwd: string | null,
): FileChange[] {
  const byPath = new Map<string, FileChange>()

  for (const execution of Object.values(tools)) {
    if (!MUTATING_TOOLS.has(execution.toolName) || execution.isError) continue

    const rawPath = pathOf(execution.args)
    if (!rawPath) continue
    const path = relativize(rawPath, cwd)

    const change = resultChange(path, execution.result?.details)
    const previous = byPath.get(path)
    byPath.set(
      path,
      previous
        ? {
            path,
            additions: sum(previous.additions, change.additions),
            deletions: sum(previous.deletions, change.deletions),
            diff: previous.diff && change.diff ? `${previous.diff}\n\n${change.diff}` : '',
          }
        : change,
    )
  }

  return [...byPath.values()]
}

/** 把绝对路径转成相对工作目录的展示路径 */
export function relativize(path: string, cwd: string | null): string {
  const prefix = cwd ? cwd.replace(/\/$/, '') + '/' : null
  return prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path.replace(/^\.\//, '')
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
  return collectFileChanges(own, cwd)
}
