import { invoke } from '@tauri-apps/api/core'

export interface InstructionDoc {
  path: string
  content: string
  exists: boolean
}

export interface SkillRecord {
  id: string
  name: string
  description: string
  scope: 'global' | 'project'
  dirPath: string
  filePath: string
  content: string
  isSymlink: boolean
}

export interface ExtensionEntry {
  name: string
  path: string
  isDir: boolean
  sizeBytes: number
}

export interface McpServerEntry {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  enabled?: boolean
  description?: string
  [key: string]: unknown
}

export interface McpConfig {
  mcpServers?: Record<string, McpServerEntry>
  [key: string]: unknown
}

export function getAgentDir(): Promise<string> {
  return invoke<string>('get_agent_dir')
}

export function readGlobalInstructions(): Promise<InstructionDoc> {
  return invoke<InstructionDoc>('read_global_instructions')
}

export function writeGlobalInstructions(content: string): Promise<InstructionDoc> {
  return invoke<InstructionDoc>('write_global_instructions', { content })
}

export function listAgentSkills(cwd: string | null): Promise<SkillRecord[]> {
  return invoke<SkillRecord[]>('list_agent_skills', { cwd })
}

export function saveAgentSkill(params: {
  scope: 'global' | 'project'
  cwd: string | null
  slug: string
  content: string
}): Promise<SkillRecord> {
  return invoke<SkillRecord>('save_agent_skill', params)
}

export function deleteAgentSkill(dirPath: string, cwd: string | null): Promise<void> {
  return invoke<void>('delete_agent_skill', { dirPath, cwd })
}

export function listLocalExtensions(): Promise<ExtensionEntry[]> {
  return invoke<ExtensionEntry[]>('list_local_extensions')
}

export function readMcpConfig(): Promise<McpConfig> {
  return invoke<McpConfig>('read_mcp_config')
}

export function writeMcpConfig(patch: McpConfig): Promise<McpConfig> {
  return invoke<McpConfig>('write_mcp_config', { patch })
}
