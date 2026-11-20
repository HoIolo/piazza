import type { ApiType } from '@/rpc/types'

/** pi 支持的四种 API 类型，见 pi 文档 docs/models.md */
export const API_OPTIONS: Array<{ value: ApiType; label: string }> = [
  { value: 'openai-completions', label: 'OpenAI Chat Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'google-generative-ai', label: 'Google Generative AI' },
]

export function apiLabel(api: ApiType | undefined): string {
  return API_OPTIONS.find((o) => o.value === api)?.label ?? '未设置 API'
}

/** 上下文窗口的可选档位。当下主流模型就这三档，其他数值按「自定义」原样保留 */
export const CONTEXT_WINDOW_PRESETS = [200_000, 400_000, 1_000_000]

/** 字段留空时 pi 采用的默认值，见 docs/models.md 的 Model Configuration 表 */
export const DEFAULT_CONTEXT_WINDOW = 128_000
export const DEFAULT_MAX_TOKENS = 16_384
