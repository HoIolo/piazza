export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX_RE = /^#([0-9a-f]{6})$/i

export function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (HEX_RE.test(trimmed)) return trimmed.toLowerCase()
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed)
  if (!short) return null
  const [r, g, b] = short[1]
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
}

export function parseHex(hex: string): Rgb {
  const clean = normalizeHex(hex) ?? '#808080'
  return {
    r: Number.parseInt(clean.slice(1, 3), 16),
    g: Number.parseInt(clean.slice(3, 5), 16),
    b: Number.parseInt(clean.slice(5, 7), 16),
  }
}

function toHexByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
}

export function mixHex(base: string, tint: string, ratio: number): string {
  const a = parseHex(base)
  const b = parseHex(tint)
  const t = Math.max(0, Math.min(1, ratio))
  return `#${toHexByte(a.r + (b.r - a.r) * t)}${toHexByte(a.g + (b.g - a.g) * t)}${toHexByte(a.b + (b.b - a.b) * t)}`
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex)
  const clamped = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${Number(clamped.toFixed(3))})`
}

function linearChannel(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b)
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA)
  const l2 = relativeLuminance(hexB)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** 为任意强调色自动挑出高对比度前景文字色（白字不足 3.5:1 时自动切换深色字） */
export function readableOn(bgHex: string): string {
  return contrastRatio('#ffffff', bgHex) >= 3.5 ? '#ffffff' : '#111216'
}
