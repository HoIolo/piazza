import {
  LANGUAGE_CONFIGS,
  type LanguageConfig,
  type RuleSpec,
  type SyntaxTokenType,
} from './highlightRules'

export type { SyntaxTokenType } from './highlightRules'

export interface SyntaxToken {
  type: SyntaxTokenType | null
  text: string
}

interface CompiledGrammar {
  regex: RegExp
  types: SyntaxTokenType[]
}

const ALIAS_ENTRIES: [string, string[]][] = [
  ['js', ['ts', 'tsx', 'typescript', 'js', 'jsx', 'javascript', 'mjs', 'cjs']],
  ['python', ['py', 'python']],
  ['rust', ['rs', 'rust']],
  ['go', ['go', 'golang']],
  ['bash', ['sh', 'bash', 'zsh', 'shell']],
  ['json', ['json', 'jsonc']],
  ['css', ['css', 'scss', 'less']],
  ['xml', ['html', 'xml', 'svg']],
  ['sql', ['sql']],
  ['yaml', ['yaml', 'yml']],
  ['toml', ['toml']],
]

const LANGUAGE_ALIASES = new Map(
  ALIAS_ENTRIES.flatMap(([target, aliases]) => aliases.map((alias) => [alias, target] as const)),
)

const MAX_HIGHLIGHT_CHARS = 25_000
const NUMBER_PATTERN =
  '\\b(?:0x[0-9a-fA-F_]+|0b[01_]+|0o[0-7_]+|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?n?)\\b'

const compiledCache = new Map<string, CompiledGrammar>()

function buildKeywordPattern(keywords: string[]): string {
  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const hasPrefix = keywords.some((kw) => kw.startsWith('@') || kw.startsWith('!'))
  return hasPrefix ? `(?:${escaped.join('|')})` : `\\b(?:${escaped.join('|')})\\b`
}

function collectRules(config: LanguageConfig): RuleSpec[] {
  const rules: RuleSpec[] = config.comments.map((pattern) => ({ type: 'comment', pattern }))
  const extras = config.extraRules ?? []
  const strings = config.strings.map((pattern): RuleSpec => ({ type: 'string', pattern }))

  rules.push(...(config.keysBeforeStrings ? [...extras, ...strings] : [...strings, ...extras]))

  if (config.keywords?.length) {
    rules.push({ type: 'keyword', pattern: buildKeywordPattern(config.keywords) })
  }
  if (config.literals?.length) {
    rules.push({ type: 'literal', pattern: `\\b(?:${config.literals.join('|')})\\b` })
  }
  rules.push({ type: 'literal', pattern: NUMBER_PATTERN })
  return rules
}

function compileLanguage(key: string): CompiledGrammar | null {
  const cached = compiledCache.get(key)
  if (cached) return cached

  const config = LANGUAGE_CONFIGS[key]
  if (!config) return null

  const rules = collectRules(config)
  const flags = config.caseInsensitive ? 'gim' : 'gm'
  const compiled: CompiledGrammar = {
    regex: new RegExp(rules.map((r) => `(${r.pattern})`).join('|'), flags),
    types: rules.map((r) => r.type),
  }
  compiledCache.set(key, compiled)
  return compiled
}

function matchedType(match: RegExpExecArray, types: SyntaxTokenType[]): SyntaxTokenType | null {
  for (let i = 0; i < types.length; i += 1) {
    if (match[i + 1] !== undefined) return types[i]
  }
  return null
}

/**
 * 将代码按语言做轻量词法切分，映射到 Codex 的 `--syntax-*` 语义色标。
 * 未识别语言或超长代码块返回 null，调用方直接降级渲染原始文本。
 */
export function tokenizeCode(code: string, language: string): SyntaxToken[] | null {
  if (!code || code.length > MAX_HIGHLIGHT_CHARS) return null
  const normalized = LANGUAGE_ALIASES.get(language.trim().toLowerCase())
  const compiled = normalized ? compileLanguage(normalized) : null
  if (!compiled) return null

  const { regex, types } = compiled
  regex.lastIndex = 0
  const tokens: SyntaxToken[] = []
  let cursor = 0

  for (let match = regex.exec(code); match !== null; match = regex.exec(code)) {
    if (match[0].length === 0) {
      regex.lastIndex += 1
      continue
    }
    if (match.index > cursor) {
      tokens.push({ type: null, text: code.slice(cursor, match.index) })
    }
    tokens.push({ type: matchedType(match, types), text: match[0] })
    cursor = match.index + match[0].length
  }

  if (cursor < code.length) {
    tokens.push({ type: null, text: code.slice(cursor) })
  }
  return tokens
}
