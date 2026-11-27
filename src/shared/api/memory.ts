import { invoke } from '@tauri-apps/api/core'
import { rpcClient } from '@/rpc/client'
import type { ConsolidateMemoriesResult } from '@/rpc/types'

export type MemoryScope = 'global' | 'project'
export type AutoExtractMode = 'smart' | 'signal' | 'off'
export type MemoryCategory =
  | 'preference'
  | 'decision'
  | 'gotcha'
  | 'workflow'
  | 'reference'
  | 'general'

export const MEMORY_CATEGORY_OPTIONS: Array<{ value: MemoryCategory; label: string }> = [
  { value: 'preference', label: '偏好' },
  { value: 'decision', label: '决策' },
  { value: 'gotcha', label: '避坑' },
  { value: 'workflow', label: '流程' },
  { value: 'reference', label: '参考' },
  { value: 'general', label: '通用' },
]

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: '偏好',
  decision: '决策',
  gotcha: '避坑',
  workflow: '流程',
  reference: '参考',
  general: '通用',
}

export interface MemoryItem {
  id: string
  scope: MemoryScope
  title: string
  category: MemoryCategory
  summary: string
  tags: string[]
  content: string
  filePath: string
  updatedAt: string
}

export interface MemoryHandoff {
  content: string
  filePath: string
  updatedAt: string
}

export interface MemoryDreamState {
  lastRunAt: string | null
  sessionsSinceDream: number
  lastSummary: string
}

export interface MemoryOverview {
  enabled: boolean
  memoryRoot: string
  globalDir: string
  projectDir: string | null
  projectName: string | null
  items: MemoryItem[]
  handoff: MemoryHandoff | null
  dream?: MemoryDreamState | null
}

export interface SaveMemoryInput {
  scope: MemoryScope
  id?: string | null
  title: string
  category?: MemoryCategory
  summary?: string
  tags?: string[]
  content: string
}

export function listMemories(cwd: string | null): Promise<MemoryOverview> {
  return invoke<MemoryOverview>('list_memories', { cwd })
}

export function saveMemory(cwd: string | null, input: SaveMemoryInput): Promise<MemoryItem> {
  return invoke<MemoryItem>('save_memory', { cwd, input })
}

export function deleteMemory(cwd: string | null, scope: MemoryScope, id: string): Promise<void> {
  return invoke<void>('delete_memory', { cwd, scope, id })
}

export function clearMemories(cwd: string | null, scope: MemoryScope): Promise<void> {
  return invoke<void>('clear_memories', { cwd, scope })
}

export function clearMemoryHandoff(cwd: string): Promise<void> {
  return invoke<void>('clear_memory_handoff', { cwd })
}

/** 经由当前运行中的主 worker 执行一次 Dream 记忆去重与合并 */
export function consolidateMemories(): Promise<ConsolidateMemoriesResult> {
  return rpcClient.send<ConsolidateMemoriesResult>(
    { type: 'consolidate_memories' },
    undefined,
    35_000,
  )
}
