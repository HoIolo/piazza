export type SyntaxTokenType =
  | 'comment'
  | 'keyword'
  | 'literal'
  | 'string'
  | 'variable'
  | 'attribute'
  | 'name'

export interface RuleSpec {
  type: SyntaxTokenType
  /** Must use non-capturing groups `(?:...)` only so top-level group indices stay aligned. */
  pattern: string
}

export interface LanguageConfig {
  comments: string[]
  keywords?: string[]
  literals?: string[]
  strings: string[]
  extraRules?: RuleSpec[]
  keysBeforeStrings?: boolean
  caseInsensitive?: boolean
}

const words = (raw: string) => raw.split(' ')

const C_COMMENTS = ['\\/\\*[\\s\\S]*?\\*\\/', '\\/\\/[^\\n]*']
const QUOTED_STRINGS = ['"(?:\\\\.|[^"\\n\\\\])*"', "'(?:\\\\.|[^'\\n\\\\])*'"]

export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  js: {
    comments: C_COMMENTS,
    strings: ['`(?:\\\\[\\s\\S]|[^`\\\\])*`', ...QUOTED_STRINGS],
    keywords: words(
      'as async await break case catch class const continue debugger default delete do else enum export extends finally for from function if implements import in instanceof interface let new of package private protected public return static switch throw try type typeof var void while with yield',
    ),
    literals: words('true false null undefined NaN Infinity'),
    extraRules: [
      { type: 'variable', pattern: '\\b(?:this|super|self|globalThis)\\b|@[A-Za-z_$][\\w$]*' },
      { type: 'attribute', pattern: '(?<=<\\/?[A-Za-z_][\\w.-]*\\s+)[a-zA-Z_:][\\w:.-]*(?=\\s*=)' },
      { type: 'name', pattern: '\\b[A-Z][A-Za-z0-9_$]*\\b|\\b[a-z_$][\\w$]*(?=\\s*\\()' },
    ],
  },
  python: {
    comments: ['#[^\\n]*'],
    strings: [
      '(?:f|r|b|u|fr|rf)?"""[\\s\\S]*?"""',
      "(?:f|r|b|u|fr|rf)?'''[\\s\\S]*?'''",
      '(?:f|r|b|u|fr|rf)?"(?:\\\\.|[^"\\n\\\\])*"',
      "(?:f|r|b|u|fr|rf)?'(?:\\\\.|[^'\\n\\\\])*'",
    ],
    keywords: words(
      'and as assert async await break class continue def del elif else except finally for from global if import in is lambda match case nonlocal not or pass raise return try while with yield',
    ),
    literals: words('True False None'),
    extraRules: [
      { type: 'variable', pattern: '@[A-Za-z_][\\w.]*|\\b(?:self|cls)\\b' },
      { type: 'name', pattern: '\\b[a-zA-Z_][\\w]*(?=\\s*\\()' },
    ],
  },
  rust: {
    comments: C_COMMENTS,
    strings: ['r#*"[\\s\\S]*?"#*', '"(?:\\\\.|[^"\\n\\\\])*"', "'(?:\\\\.|[^'\\n\\\\])'"],
    keywords: words(
      'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return static struct super trait type unsafe use where while',
    ),
    literals: words('true false Some None Ok Err'),
    extraRules: [
      { type: 'variable', pattern: "#!?\\[[^\\]]*\\]|'[a-zA-Z_][\\w]*" },
      { type: 'name', pattern: '\\b[A-Z][A-Za-z0-9_]*\\b|\\b[a-z_][\\w]*(?:!|\\s*(?=\\())' },
    ],
  },
  go: {
    comments: C_COMMENTS,
    strings: ['`[^`]*`', ...QUOTED_STRINGS],
    keywords: words(
      'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
    ),
    literals: words('true false nil iota'),
    extraRules: [
      { type: 'name', pattern: '\\b[A-Z][A-Za-z0-9_]*\\b|\\b[a-z_][\\w]*(?=\\s*\\()' },
    ],
  },
  bash: {
    comments: ['(?<=^|[\\s;])#[^\\n]*'],
    strings: ['"(?:\\\\.|[^"\\\\])*"', "'[^']*'", '\\$\\([^)]*\\)'],
    keywords: words(
      'case do done elif else esac export fi for function if in local readonly return select then until while',
    ),
    literals: words('true false'),
    extraRules: [
      { type: 'variable', pattern: '\\$\\{[\\w:#%-]+\\}|\\$[A-Za-z_@*?#!$0-9][\\w]*' },
      { type: 'attribute', pattern: '(?<=\\s)--?[A-Za-z0-9][\\w-]*' },
    ],
  },
  json: {
    comments: C_COMMENTS,
    strings: ['"(?:\\\\.|[^"\\n\\\\])*"'],
    literals: words('true false null'),
    keysBeforeStrings: true,
    extraRules: [{ type: 'attribute', pattern: '"(?:\\\\.|[^"\\n\\\\])*"(?=\\s*:)' }],
  },
  css: {
    comments: ['\\/\\*[\\s\\S]*?\\*\\/'],
    strings: QUOTED_STRINGS,
    keywords: ['@[a-z-]+', '!important'],
    extraRules: [
      { type: 'literal', pattern: '#[0-9a-fA-F]{3,8}\\b' },
      { type: 'variable', pattern: '--[a-zA-Z0-9-]+' },
      { type: 'attribute', pattern: '[a-z-]+(?=\\s*:)' },
      { type: 'name', pattern: '(?:\\.|#)[A-Za-z_][\\w-]*' },
    ],
  },
  xml: {
    comments: ['<!--[\\s\\S]*?-->'],
    strings: ['"[^"]*"', "'[^']*'"],
    extraRules: [
      { type: 'name', pattern: '(?<=<\\/?)[A-Za-z][\\w:.-]*' },
      { type: 'attribute', pattern: '[A-Za-z_:][\\w:.-]*(?=\\s*=)' },
    ],
  },
  sql: {
    comments: ['\\/\\*[\\s\\S]*?\\*\\/', '--[^\\n]*'],
    strings: ["'(?:''|[^'])*'"],
    caseInsensitive: true,
    keywords: words(
      'ALTER AND AS ASC BY CASE CREATE DELETE DESC DISTINCT DROP ELSE END EXISTS FROM GROUP HAVING IN INDEX INNER INSERT INTO IS JOIN LEFT LIMIT NOT OFFSET ON OR ORDER OUTER PRIMARY RIGHT SELECT SET TABLE THEN UNION UPDATE VALUES WHEN WHERE',
    ),
    literals: words('true false null'),
  },
  yaml: {
    comments: ['(?<=^|\\s)#[^\\n]*'],
    strings: ['"(?:\\\\.|[^"\\n\\\\])*"', "'[^'\\n]*'"],
    literals: words('true false null yes no'),
    extraRules: [{ type: 'attribute', pattern: '^[ \\t-]*[A-Za-z0-9_.-]+(?=\\s*:)' }],
  },
  toml: {
    comments: ['#[^\\n]*'],
    strings: ['"""[\\s\\S]*?"""', "'''[\\s\\S]*?'''", '"(?:\\\\.|[^"\\n\\\\])*"', "'[^'\\n]*'"],
    literals: words('true false'),
    extraRules: [
      { type: 'name', pattern: '^\\s*\\[+[^\\]\\n]+\\]+' },
      { type: 'attribute', pattern: '^[ \\t]*[A-Za-z0-9_.-]+(?=\\s*=)' },
    ],
  },
}
