import type { Question } from '@/shared/utils/questionnaire'

/** 按键在面板里的语义 */
export type KeyAction =
  | { kind: 'ignore' }
  | { kind: 'dismiss' }
  | { kind: 'clear-custom' }
  | { kind: 'move'; cursor: number }
  | { kind: 'page'; to: number }
  | { kind: 'pick'; label: string }
  | { kind: 'focus-custom' }

export interface KeyContext {
  question: Question
  cursor: number
  index: number
  total: number
  /** 焦点在自填框里：方向键归光标，只接管 Esc */
  inCustom: boolean
}

/**
 * 把按键翻译成面板动作。
 *
 * 抽成纯函数是因为这里的判断最容易越写越乱：焦点在自填框时只认 Esc、
 * 方向键在题内移动、←→ 跨题翻页、数字直选——几条规则互相约束，
 * 放在 effect 里会很快堆成一个读不懂的分支网。
 */
export function resolveKey(key: string, ctx: KeyContext): KeyAction {
  if (ctx.inCustom) return key === 'Escape' ? { kind: 'clear-custom' } : { kind: 'ignore' }
  return vertical(key, ctx) ?? paging(key, ctx) ?? confirm(key, ctx) ?? { kind: 'ignore' }
}

/**
 * ↑↓ 在选项与自填行之间移动光标。
 *
 * cursor 为 -1 表示「还没落位」：面板刚打开时不预选任何一项，
 * 否则第一行会带高亮底色、编号反色、箭头浮出，看起来像已经选中了。
 * 从 -1 按 ↓ 落到第一项，按 ↑ 落到自填行（用户想自己写的可能性更大）。
 */
function vertical(key: string, ctx: KeyContext): KeyAction | null {
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  if (step === 0) return null
  const limit = ctx.question.options.length
  if (ctx.cursor < 0) return { kind: 'move', cursor: step > 0 ? 0 : limit }
  return { kind: 'move', cursor: Math.min(Math.max(ctx.cursor + step, 0), limit) }
}

/** ←→ 跨题翻页；越界与单题都不响应 */
function paging(key: string, ctx: KeyContext): KeyAction | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  if (ctx.total < 2) return { kind: 'ignore' }
  const to = ctx.index + (key === 'ArrowRight' ? 1 : -1)
  return to < 0 || to >= ctx.total ? { kind: 'ignore' } : { kind: 'page', to }
}

/** Esc 关闭、Enter 选中/聚焦自填、数字直选 */
function confirm(key: string, ctx: KeyContext): KeyAction | null {
  if (key === 'Escape') return { kind: 'dismiss' }
  if (key === 'Enter') {
    // 未落位时回车没有指向：什么都不做，而不是替用户选第一项
    if (ctx.cursor < 0) return { kind: 'ignore' }
    const option = ctx.question.options[ctx.cursor]
    return option ? { kind: 'pick', label: option.label } : { kind: 'focus-custom' }
  }
  const digit = Number(key)
  if (!Number.isInteger(digit) || digit < 1 || digit > ctx.question.options.length) return null
  return { kind: 'pick', label: ctx.question.options[digit - 1].label }
}
