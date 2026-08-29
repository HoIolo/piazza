import type { ApiType } from '@/rpc/types'

/** pi 支持的四种 API 类型，见 pi 文档 docs/models.md */
export const API_OPTIONS: Array<{ value: ApiType; label: string }> = [
  { value: 'openai-completions', label: 'OpenAI Chat Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'google-generative-ai', label: 'Google Generative AI' },
]
