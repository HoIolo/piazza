import type { ThinkingLevel } from '@/rpc/types'

/**
 * 思考强度的档位，与 pi 的 EXTENDED_THINKING_LEVELS 一致。
 * off..high 是标准档；xhigh / max 属于「需显式声明」的扩展档，
 * 模型没有在 thinkingLevelMap 里给出映射时，pi 不会把它们列出来。
 */
export const THINKING_LEVELS: ThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

/**
 * 一个档位在某个模型上的映射：
 * - string：发给厂商的参数值
 * - null：该模型不支持这一档
 * - 缺省：标准档走厂商默认，扩展档（xhigh/max）视为不支持
 */
export type LevelMap = Partial<Record<ThinkingLevel, string | null>>

export interface ThinkingPreset {
  /** 预设名，显示在「匹配到 …」提示里 */
  label: string
  /** 按顺序匹配模型 ID 前缀，越具体越靠前 */
  match: RegExp
  map: LevelMap
}

/**
 * 常见模型的思考强度映射，取自 pi-ai 内置厂商目录里真实的 thinkingLevelMap
 * （`@earendil-works/pi-ai/dist/providers/data/*.json`），不是猜的。
 *
 * 顺序即优先级：越具体的家族放越前面，`gpt-5.2` 必须排在 `gpt-5` 之前。
 */
export const THINKING_PRESETS: ThinkingPreset[] = [
  // ---- OpenAI：o 系列与 GPT-5 系列，max 都不支持 ----
  {
    label: 'o 系列',
    match: /^o\d/,
    map: { minimal: null, xhigh: null, max: null },
  },
  {
    label: 'GPT-5.2 及以后',
    match: /^gpt-5\.[2-9]/,
    map: { minimal: null, off: 'none', max: null },
  },
  {
    label: 'GPT-5 / 5.1',
    match: /^gpt-5(\.1)?(-|$)/,
    map: { minimal: null, xhigh: null, max: null },
  },
  {
    label: 'GPT-5 早期版本',
    match: /^gpt-5/,
    map: { minimal: 'minimal', xhigh: null, max: null },
  },

  // ---- Anthropic：只有 opus/sonnet 的 5.x 才给全档，其余仅补扩展档 ----
  {
    label: 'Claude Opus / Sonnet 5',
    match: /^claude-(opus|sonnet)-5(\.\d+)?(-|$)/,
    map: { minimal: null },
  },
  {
    label: 'Claude 4.x 及更早',
    match: /^claude-/,
    map: { minimal: null, xhigh: null, max: null },
  },

  // ---- Google：Gemini 全系不支持 max，部分不支持 xhigh ----
  {
    label: 'Gemini',
    match: /^gemini-/,
    map: { minimal: null, xhigh: null, max: null },
  },

  // ---- 国产与开源 ----
  {
    label: 'DeepSeek V4',
    match: /^deepseek-v4/,
    map: { minimal: null, medium: null, xhigh: null },
  },
  {
    label: 'DeepSeek',
    match: /^deepseek/,
    map: { minimal: null, medium: null, xhigh: null },
  },
  {
    label: 'GLM 5.3 及以后',
    match: /^glm-5\.[3-9]/,
    map: { minimal: null, medium: null, xhigh: null },
  },
  {
    label: 'GLM',
    match: /^glm-/,
    map: { minimal: null, low: null, medium: null, off: 'none', xhigh: null },
  },
  {
    label: 'Kimi K3',
    match: /^kimi-k3/,
    map: { minimal: null, medium: null, xhigh: null },
  },
  {
    label: 'Qwen',
    match: /^qwen/,
    map: { minimal: null, high: null, max: null },
  },
  {
    label: 'Grok',
    match: /^grok-/,
    map: { minimal: null, max: null },
  },
  {
    label: 'Mistral',
    match: /^mistral-|^magistral-/,
    map: { minimal: null, xhigh: null, max: null },
  },
]

/** 找模型对应的预设；匹配不到返回 null，交给用户展开高级配置手填 */
export function matchThinkingPreset(modelId: string): ThinkingPreset | null {
  const id = modelId.trim().toLowerCase()
  if (!id) return null
  return THINKING_PRESETS.find((preset) => preset.match.test(id)) ?? null
}

/**
 * 该模型在这个映射下实际可用的档位。
 *
 * 不含 off：`off` 是「关掉思考」这个动作本身，任何推理模型都具备，
 * 把它列进档位会让界面上出现「关闭 / 低 / 中 / 高」并排的怪状。
 */
export function availableLevels(map: LevelMap | undefined): ThinkingLevel[] {
  return THINKING_LEVELS.filter((level) => {
    if (level === 'off') return false
    const mapped = map?.[level]
    if (mapped === null) return false
    // 扩展档必须显式给值，pi 才不会把它当作不支持
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  })
}

/** 是否支持「关闭思考」：off 显式为 null 才算不支持 */
export function supportsOff(map: LevelMap | undefined): boolean {
  return map?.off !== null
}
