import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'

export const VALID_CATEGORIES = [
  'preference',
  'decision',
  'gotcha',
  'workflow',
  'reference',
  'general',
]

/** 与 src-tauri/src/memory.rs 的 normalize_cwd 完全一致 */
export function normalizeCwd(cwd) {
  let s = String(cwd || '').trim().replaceAll('\\', '/')
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  if (s.length >= 2 && s[1] === ':' && s[0] >= 'A' && s[0] <= 'Z') {
    s = s[0].toLowerCase() + s.slice(1)
  }
  return s
}

/** 32-bit FNV-1a 哈希，与 Rust 端 fnv1a_32_hex 逐字节一致 */
export function fnv1a32Hex(input) {
  const bytes = Buffer.from(String(input), 'utf8')
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i]
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function asciiSlug(raw, maxLen) {
  let out = ''
  let prevDash = false
  for (const ch of String(raw || '')) {
    const code = ch.charCodeAt(0)
    const isAlphaNum =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      ch === '_'
    if (isAlphaNum) {
      out += ch.toLowerCase()
      prevDash = false
    } else if (!prevDash && out.length > 0) {
      out += '-'
      prevDash = true
    }
    if (out.length >= maxLen) break
  }
  return out.replace(/^-+|-+$/g, '')
}

/** 与 Rust 端 project_dir_key 一致：<slug>-<fnv1a8> */
export function projectDirKey(cwd) {
  const normalized = normalizeCwd(cwd)
  const segments = normalized.split('/').filter(Boolean)
  const base = segments.length > 0 ? segments[segments.length - 1] : 'project'
  const slug = asciiSlug(base, 24) || 'project'
  return `${slug}-${fnv1a32Hex(normalized)}`
}

export function resolveMemoryRoot(agentDir) {
  const custom = (process.env.PIAZZA_MEMORY_DIR || '').trim()
  if (custom) return custom
  return join(agentDir, 'memory')
}

export function resolveScopeDir(root, scope, cwd) {
  if (scope === 'global') return join(root, 'global')
  if (scope === 'project') {
    if (!cwd || !String(cwd).trim()) throw new Error('未提供项目路径，无法访问项目记忆')
    return join(root, 'projects', projectDirKey(cwd))
  }
  throw new Error(`无效的作用范围：${scope}`)
}

/** 容错剥离 `.md` 后缀（模型常把索引里的 `foo.md` 直接传进来），同时严格拦截路径穿越 */
export function validateEntryId(raw) {
  const trimmed = String(raw || '').trim().replace(/\.md$/i, '')
  if (!trimmed || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('记忆 ID 包含非法路径字符')
  }
  const slug = asciiSlug(trimmed, 64)
  if (!slug || ['memory', 'handoff', 'project'].includes(slug)) {
    throw new Error('记忆 ID 不可使用保留名（MEMORY / handoff）')
  }
  return slug
}

function normalizeTitleKey(title) {
  return String(title || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** 确定性 ID：同标题自动复用原 ID 避免重复堆砌；中文标题按标题哈希稳定生成（不含时间戳） */
export function deriveEntryId(explicit, title, existingItems = []) {
  if (explicit && String(explicit).trim()) return validateEntryId(explicit)
  const normTitle = normalizeTitleKey(title)
  const matched = existingItems.find((item) => normalizeTitleKey(item.title) === normTitle)
  if (matched) return matched.id
  const fromTitle = asciiSlug(title, 40)
  if (fromTitle && !['memory', 'handoff', 'project'].includes(fromTitle)) return fromTitle
  return `mem-${fnv1a32Hex(normTitle || 'entry')}`
}

export function normalizeCategory(raw) {
  const value = String(raw || 'general').trim().toLowerCase()
  return VALID_CATEGORIES.includes(value) ? value : 'general'
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const out = []
  for (const raw of tags) {
    const cleaned = String(raw || '').trim().replace(/^#+/, '').trim()
    if (cleaned && !out.includes(cleaned)) out.push(cleaned)
    if (out.length >= 12) break
  }
  return out
}

function yamlScalar(value) {
  return JSON.stringify(String(value || '').replace(/[\r\n]+/g, ' ').trim())
}

function parseYamlScalar(raw) {
  const trimmed = String(raw || '').trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === 'string') return parsed
    } catch {
      // 退回原样去引号
    }
  }
  return trimmed.replace(/^'+|'+$/g, '')
}

function parseYamlTags(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return normalizeTags(parsed)
  } catch {
    // 兼容非标准逗号分隔
  }
  return normalizeTags(trimmed.slice(1, -1).split(',').map(parseYamlScalar))
}

export function formatMemoryMarkdown(item) {
  const tagsJson = JSON.stringify(item.tags || [])
  const body = String(item.content || '').trim()
  return [
    '---',
    `title: ${yamlScalar(item.title)}`,
    `category: ${item.category}`,
    `summary: ${yamlScalar(item.summary)}`,
    `tags: ${tagsJson}`,
    `updatedAt: ${item.updatedAt}`,
    '---',
    '',
    body,
    '',
  ].join('\n')
}

export function parseMemoryMarkdown(id, scope, filePath, raw) {
  let title = id
  let category = 'general'
  let summary = ''
  let tags = []
  let updatedAt = ''
  let body = String(raw || '')

  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
  if (match) {
    const [, header, rest] = match
    body = rest.trim()
    for (const line of header.split(/\r?\n/)) {
      const colon = line.indexOf(':')
      if (colon <= 0) continue
      const key = line.slice(0, colon).trim()
      const val = line.slice(colon + 1)
      if (key === 'title') {
        const parsed = parseYamlScalar(val)
        if (parsed) title = parsed
      } else if (key === 'category') {
        category = normalizeCategory(parseYamlScalar(val))
      } else if (key === 'summary') {
        summary = parseYamlScalar(val)
      } else if (key === 'tags') {
        tags = parseYamlTags(val)
      } else if (key === 'updatedAt') {
        updatedAt = parseYamlScalar(val)
      }
    }
  }

  if (!summary) {
    const first = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'))
    summary = (first || '').slice(0, 120)
  }

  return { id, scope, title, category, summary, tags, content: body, filePath, updatedAt }
}

function atomicWrite(filePath, content) {
  mkdirSync(join(filePath, '..'), { recursive: true })
  const tmp = `${filePath}.tmp`
  writeFileSync(tmp, content, 'utf8')
  renameSync(tmp, filePath)
}

export function listScopeMemories(root, scope, cwd) {
  const dir = resolveScopeDir(root, scope, cwd)
  if (!existsSync(dir)) return []
  const items = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue
    const stem = name.slice(0, -3)
    if (stem.toLowerCase() === 'memory' || stem.toLowerCase() === 'handoff') continue
    const full = join(dir, name)
    try {
      if (!statSync(full).isFile()) continue
      items.push(parseMemoryMarkdown(stem, scope, full, readFileSync(full, 'utf8')))
    } catch {
      // 跳过瞬态读取失败
    }
  }
  items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.id.localeCompare(b.id))
  return items
}

export function rebuildScopeIndex(root, scope, cwd) {
  const dir = resolveScopeDir(root, scope, cwd)
  const items = listScopeMemories(root, scope, cwd)
  const indexPath = join(dir, 'MEMORY.md')
  if (items.length === 0) {
    if (existsSync(indexPath)) rmSync(indexPath, { force: true })
    return
  }
  const heading = scope === 'global' ? '# 全局记忆索引' : '# 项目记忆索引'
  const lines = [heading, '']
  for (const item of items) {
    const tagStr = item.tags.length ? ` ${item.tags.map((t) => `#${t}`).join(' ')}` : ''
    const sumStr = item.summary ? ` — ${item.summary}` : ''
    lines.push(`- [${item.title}](${item.id}.md) (id: ${item.id}, ${item.category})${tagStr}${sumStr}`)
  }
  atomicWrite(indexPath, `${lines.join('\n')}\n`)
}

export function saveMemoryEntry(root, cwd, input) {
  const scope = input.scope === 'global' ? 'global' : 'project'
  const title = String(input.title || '').trim()
  const content = String(input.content || '').trim()
  if (!title) throw new Error('记忆标题不能为空')
  if (!content) throw new Error('记忆内容不能为空')
  const dir = resolveScopeDir(root, scope, cwd)
  const existing = listScopeMemories(root, scope, cwd)
  const id = deriveEntryId(input.id, title, existing)
  const filePath = join(dir, `${id}.md`)
  const summary =
    String(input.summary || '').trim() ||
    content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'))
      ?.slice(0, 120) ||
    title
  const item = {
    id,
    scope,
    title,
    category: normalizeCategory(input.category),
    summary,
    tags: normalizeTags(input.tags),
    content,
    filePath,
    updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }
  atomicWrite(filePath, formatMemoryMarkdown(item))
  if (scope === 'project' && cwd) {
    const norm = normalizeCwd(cwd)
    const meta = { cwd: norm, name: basename(norm) || norm, updatedAt: item.updatedAt }
    try {
      writeFileSync(join(dir, '.project.json'), JSON.stringify(meta, null, 2), 'utf8')
    } catch {
      // 元数据写入失败不阻断主流程
    }
  }
  rebuildScopeIndex(root, scope, cwd)
  return item
}

export function deleteMemoryEntry(root, cwd, scope, id) {
  const dir = resolveScopeDir(root, scope, cwd)
  const safeId = validateEntryId(id)
  const filePath = join(dir, `${safeId}.md`)
  const existed = existsSync(filePath)
  if (existed) rmSync(filePath, { force: true })
  rebuildScopeIndex(root, scope, cwd)
  return { existed, id: safeId }
}

export function readMemoryEntry(root, cwd, scope, id) {
  const dir = resolveScopeDir(root, scope, cwd)
  const safeId = validateEntryId(id)
  const filePath = join(dir, `${safeId}.md`)
  if (!existsSync(filePath)) return null
  return parseMemoryMarkdown(safeId, scope, filePath, readFileSync(filePath, 'utf8'))
}

/**
 * 中英文混合分词器：
 * - 英文/数字按词元切分；
 * - 连续中文保留完整短语（高权重），同时切出重叠 2-gram（解决无空格中文搜索漏召回问题）。
 */
export function tokenizeSearchQuery(query) {
  const raw = String(query || '').trim().toLowerCase()
  const exactTerms = new Set()
  const ngramTerms = new Set()

  for (const m of raw.matchAll(/[a-z0-9_.-]+/g)) {
    if (m[0]) exactTerms.add(m[0])
  }
  for (const m of raw.matchAll(/[\u4e00-\u9fff]+/g)) {
    const run = m[0]
    if (!run) continue
    exactTerms.add(run)
    if (run.length >= 2) {
      for (let i = 0; i < run.length - 1; i += 1) {
        ngramTerms.add(run.slice(i, i + 2))
      }
    }
  }
  return { exactTerms: [...exactTerms], ngramTerms: [...ngramTerms] }
}

function scoreTerm(fields, term, multiplier) {
  let pts = 0
  if (fields.id === term) pts += 14
  if (fields.title.includes(term)) pts += 9
  if (fields.tags.some((t) => t.includes(term))) pts += 7
  if (fields.category === term) pts += 5
  if (fields.summary.includes(term)) pts += 4
  if (fields.body.includes(term)) pts += 2.5
  return pts * multiplier
}

export function searchMemories(root, cwd, query, scope = 'all', limit = 8, category = '') {
  const scopes = scope === 'all' ? ['project', 'global'] : [scope]
  const catFilter = String(category || '').trim().toLowerCase()
  const all = scopes
    .flatMap((s) => {
      try {
        return listScopeMemories(root, s, cwd)
      } catch {
        return []
      }
    })
    .filter((item) => !catFilter || item.category === catFilter)

  const { exactTerms, ngramTerms } = tokenizeSearchQuery(query)
  if (exactTerms.length === 0 && ngramTerms.length === 0) return all.slice(0, limit)

  const scored = []
  for (const item of all) {
    const fields = {
      id: item.id.toLowerCase(),
      title: item.title.toLowerCase(),
      summary: item.summary.toLowerCase(),
      tags: item.tags.map((t) => t.toLowerCase()),
      category: item.category.toLowerCase(),
      body: item.content.toLowerCase(),
    }
    let score = 0
    let matchedCount = 0
    for (const term of exactTerms) {
      const s = scoreTerm(fields, term, 1.0)
      if (s > 0) {
        score += s
        matchedCount += 1
      }
    }
    for (const gram of ngramTerms) {
      if (exactTerms.includes(gram)) continue
      const s = scoreTerm(fields, gram, 0.55)
      if (s > 0) {
        score += s
        matchedCount += 1
      }
    }
    if (score > 0) {
      const totalUnits = Math.max(1, exactTerms.length + ngramTerms.length)
      const coverageBoost = 1 + (matchedCount / totalUnits) * 0.5
      const scopeBonus = item.scope === 'project' ? 0.5 : 0
      scored.push({ item, score: score * coverageBoost + scopeBonus })
    }
  }
  scored.sort(
    (a, b) => b.score - a.score || (b.item.updatedAt || '').localeCompare(a.item.updatedAt || ''),
  )
  return scored.slice(0, limit).map((s) => s.item)
}

/** 读取压缩交接快照，同时解析其绑定的 sessionId，防止旧会话交接污染全新会话 */
export function readProjectHandoff(root, cwd) {
  if (!cwd) return null
  const filePath = join(resolveScopeDir(root, 'project', cwd), 'handoff.md')
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf8').trim()
    if (!raw) return null
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
    if (!match) return { sessionId: null, content: raw }
    let sessionId = null
    for (const line of match[1].split(/\r?\n/)) {
      const colon = line.indexOf(':')
      if (colon > 0 && line.slice(0, colon).trim() === 'sessionId') {
        sessionId = parseYamlScalar(line.slice(colon + 1)) || null
      }
    }
    return { sessionId, content: match[2].trim() }
  } catch {
    return null
  }
}

export function writeProjectHandoff(root, cwd, content, sessionId = null) {
  if (!cwd || !content.trim()) return
  const dir = resolveScopeDir(root, 'project', cwd)
  const header = sessionId
    ? `---\nsessionId: ${yamlScalar(sessionId)}\nupdatedAt: ${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}\n---\n\n`
    : ''
  atomicWrite(join(dir, 'handoff.md'), `${header}${content.trim()}\n`)
}

function statDirMdFiles(dir) {
  if (!existsSync(dir)) return 'none'
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => {
        try {
          const s = statSync(join(dir, name))
          return `${name}:${s.mtimeMs}:${s.size}`
        } catch {
          return `${name}:0`
        }
      })
      .join(',')
  } catch {
    return 'err'
  }
}

/**
 * 极轻量目录指纹（stat 全部 .md，通常 < 30 个文件耗时 < 0.2ms）：
 * - 无改动时逐字节稳定，保护 KV Cache；
 * - 无论在设置页还是外部编辑器修改任何记忆正文，下一轮自动感知刷新。
 */
export function memoryRevisionStamp(root, cwd, sessionId = '') {
  const parts = [statDirMdFiles(join(root, 'global'))]
  if (cwd) parts.push(statDirMdFiles(resolveScopeDir(root, 'project', cwd)))
  parts.push(String(sessionId || ''))
  return parts.join('|')
}
