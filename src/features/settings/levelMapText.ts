import type { ThinkingLevel } from '@/rpc/types'
import { THINKING_LEVELS, type LevelMap } from './thinkingPresets'

/** 扩展档：需要显式映射，界面上单独标注 */
export const EXTENDED_LEVELS: ThinkingLevel[] = ['xhigh', 'max']

export type LevelState = 'on' | 'off' | 'default'

export function stateOf(level: ThinkingLevel, map: LevelMap | undefined): LevelState {
  const mapped = map?.[level]
  if (mapped === null) return 'off'
  if (typeof mapped === 'string') return 'on'
  return 'default'
}

/**
 * 点一下档位：支持 ↔ 不支持。
 * 从「不支持」切回来时，标准档留空走厂商默认，扩展档给同名值——
 * 扩展档不给值的话 pi 仍然当作不支持，点了等于没反应。
 */
export function toggleLevel(level: ThinkingLevel, map: LevelMap | undefined): LevelMap | undefined {
  const next: LevelMap = { ...map }
  if (stateOf(level, map) === 'off') {
    if (EXTENDED_LEVELS.includes(level)) next[level] = level
    else delete next[level]
  } else {
    next[level] = null
  }
  return Object.keys(next).length > 0 ? next : undefined
}

/** 映射表的紧凑文本形式，形如 high=high, minimal=null */
export function rawText(map: LevelMap | undefined): string {
  if (!map) return ''
  return Object.entries(map)
    .map(([level, value]) => `${level}=${value === null ? 'null' : value}`)
    .join(', ')
}

/** 解析上面的文本形式；无法识别的档位名直接忽略，避免写坏配置 */
export function parseRaw(text: string): LevelMap | undefined {
  const map: LevelMap = {}
  for (const part of text.split(',')) {
    const [rawLevel, rawValue] = part.split('=').map((s) => s.trim())
    if (!rawLevel) continue
    const level = rawLevel as ThinkingLevel
    if (!THINKING_LEVELS.includes(level)) continue
    map[level] = rawValue === 'null' || rawValue === '' ? null : rawValue
  }
  return Object.keys(map).length > 0 ? map : undefined
}
