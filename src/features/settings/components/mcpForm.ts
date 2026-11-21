import type { McpServerEntry } from '@/shared/api/agentResources'

export type McpTransport = 'stdio' | 'http'

export interface McpDraft {
  name: string
  transport: McpTransport
  command: string
  argsText: string
  envText: string
  url: string
  headersText: string
  description: string
}

function formatPairs(map?: Record<string, string>): string {
  if (!map) return ''
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

function parsePairs(text: string): Record<string, string> | undefined {
  const result: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const k = line.slice(0, idx).trim()
    const v = line.slice(idx + 1).trim()
    if (k) result[k] = v
  }
  return Object.keys(result).length > 0 ? result : undefined
}

const EMPTY_ENTRY: McpServerEntry = {}

export function draftFromEntry(name: string | null, raw?: McpServerEntry): McpDraft {
  const entry = raw ?? EMPTY_ENTRY
  const transport: McpTransport = entry.url && !entry.command ? 'http' : 'stdio'
  return {
    name: name ?? '',
    transport,
    command: entry.command ?? '',
    argsText: entry.args ? entry.args.join(' ') : '',
    envText: formatPairs(entry.env),
    url: entry.url ?? '',
    headersText: formatPairs(entry.headers),
    description: entry.description ?? '',
  }
}

export function validateMcpDraft(
  draft: McpDraft,
  editingName: string | null,
  existing: Record<string, McpServerEntry>,
): string | null {
  const name = draft.name.trim()
  if (!name) return '服务器名称不能为空'
  if (name !== editingName && existing[name]) return `名称「${name}」已存在`
  if (draft.transport === 'stdio' && !draft.command.trim()) return '启动命令不能为空'
  if (draft.transport === 'http' && !draft.url.trim()) return '服务 URL 不能为空'
  return null
}

export function buildMcpEntry(draft: McpDraft, previous?: McpServerEntry): McpServerEntry {
  const base: McpServerEntry = previous ? { ...previous } : {}
  delete base.command
  delete base.args
  delete base.env
  delete base.url
  delete base.headers

  const desc = draft.description.trim()
  if (desc) base.description = desc
  else delete base.description

  if (draft.transport === 'http') {
    base.url = draft.url.trim()
    const headers = parsePairs(draft.headersText)
    if (headers) base.headers = headers
  } else {
    base.command = draft.command.trim()
    const args = draft.argsText.trim().split(/\s+/).filter(Boolean)
    if (args.length > 0) base.args = args
    const env = parsePairs(draft.envText)
    if (env) base.env = env
  }
  return base
}
