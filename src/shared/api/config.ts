import { invoke } from '@tauri-apps/api/core'
import type { ApiType } from '@/rpc/types'

/** models.json 中单个模型的配置形态 */
export interface ModelConfig {
  id: string
  name?: string
  reasoning?: boolean
  /**
   * 思考强度映射：pi 的档位 → 发给厂商的参数值。
   * null 表示该档不支持，缺省则标准档走厂商默认、扩展档（xhigh/max）视为不支持。
   */
  thinkingLevelMap?: Record<string, string | null>
  input?: Array<'text' | 'image'>
  contextWindow?: number
  maxTokens?: number
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number }
  api?: ApiType
  compat?: Record<string, unknown>
}

/** models.json 中单个 provider 的配置形态 */
export interface ProviderConfig {
  name?: string
  baseUrl?: string
  api?: ApiType
  apiKey?: string
  authHeader?: boolean
  headers?: Record<string, string>
  compat?: Record<string, unknown>
  models?: ModelConfig[]
  /** 保留 GUI 不认识的字段，避免保存时丢失用户手写配置 */
  [key: string]: unknown
}

export interface ModelsConfig {
  providers?: Record<string, ProviderConfig>
  [key: string]: unknown
}

/** pi 的 settings.json */
export interface PiSettings {
  packages?: string[]
  theme?: string
  defaultProvider?: string
  defaultModel?: string
  defaultThinkingLevel?: string
  [key: string]: unknown
}

export function readModelsConfig(): Promise<ModelsConfig> {
  return invoke<ModelsConfig>('read_models_config')
}

/** 保存后返回回读结果，调用方据此确认落盘内容 */
export function writeModelsConfig(patch: ModelsConfig): Promise<ModelsConfig> {
  return invoke<ModelsConfig>('write_models_config', { patch })
}

export function readAppSettings(): Promise<PiSettings> {
  return invoke<PiSettings>('read_app_settings')
}

export function writeAppSettings(patch: PiSettings): Promise<PiSettings> {
  return invoke<PiSettings>('write_app_settings', { patch })
}

/** 一个可选的终端 Shell，由 Rust 侧探测得出 */
export interface ShellOption {
  kind: 'git-bash' | 'wsl'
  label: string
  path: string
  note: string
}

/**
 * 列出这台机器上可用的 Shell。
 *
 * 探测在 Rust 侧做：要看真实文件系统，还要顺着 PATH 反推 Git 装在哪，
 * 这些在前端都办不到。
 */
export function listShells(): Promise<ShellOption[]> {
  return invoke<ShellOption[]>('list_shells')
}
