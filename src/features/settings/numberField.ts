/** 数字框的读写。空串表示「不设置」，交给 pi 用默认值；非正数一律视为没填 */
export function parseNumber(text: string): number | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function numberText(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}
