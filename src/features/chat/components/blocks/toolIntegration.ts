/** 从 pi 扩展工具保留的 MCP 名称中提取集成来源。 */
export function integrationSource(toolName: string): string | null {
  return /^mcp__(.+?)__/.exec(toolName)?.[1] ?? null
}

export function integrationSummary(names: string[]): string | null {
  const sources = [
    ...new Set(names.map(integrationSource).filter((source): source is string => source !== null)),
  ]
  if (!sources.length) return null
  const actions = []
  if (names.some((name) => /(?:^|_)(?:read|read_file)(?:_|$)/i.test(name))) actions.push('读取文件')
  if (names.some((name) => /(?:bash|exec|run_code|run_command)/i.test(name)))
    actions.push('运行了命令')
  return `已使用 ${sources.join('、')} 集成${actions.join('')}`
}
