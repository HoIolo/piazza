/** 把 catch 到的未知值转成可展示的文案。非 Error 值（如字符串）也能安全兜底 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
