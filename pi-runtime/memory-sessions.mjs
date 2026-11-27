import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeCwd, tokenizeSearchQuery } from './memory-store.mjs'

const MAX_FILES_TO_CHECK = 120
const MAX_MATCHED_SESSIONS = 40
const MAX_FILE_BYTES = 4 * 1024 * 1024
const MAX_SNIPPET_CHARS = 300
const MAX_OUTPUT_CHARS = 3_800

function readFirstLine(filePath) {
  let fd
  try {
    fd = openSync(filePath, 'r')
    const buf = Buffer.allocUnsafe(4096)
    const n = readSync(fd, buf, 0, buf.length, 0)
    if (n <= 0) return ''
    const chunk = buf.toString('utf8', 0, n)
    const nl = chunk.indexOf('\n')
    return (nl >= 0 ? chunk.slice(0, nl) : chunk).trim()
  } catch {
    return ''
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // ignore
      }
    }
  }
}

function extractTextOnly(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n')
}

function scoreText(text, exactTerms, ngramTerms) {
  const lower = text.toLowerCase()
  let score = 0
  let hits = 0
  for (const t of exactTerms) {
    if (lower.includes(t)) {
      score += 8
      hits += 1
    }
  }
  for (const g of ngramTerms) {
    if (exactTerms.includes(g)) continue
    if (lower.includes(g)) {
      score += 4.2
      hits += 1
    }
  }
  if (score <= 0) return 0
  const total = Math.max(1, exactTerms.length + ngramTerms.length)
  return score * (1 + (hits / total) * 0.45)
}

function collectSessionFiles(agentDir) {
  const sessionsRoot = join(agentDir, 'sessions')
  if (!existsSync(sessionsRoot)) return []
  const files = []
  try {
    for (const dirEntry of readdirSync(sessionsRoot, { withFileTypes: true })) {
      if (!dirEntry.isDirectory()) continue
      const dirPath = join(sessionsRoot, dirEntry.name)
      let names = []
      try {
        names = readdirSync(dirPath)
      } catch {
        continue
      }
      for (const name of names) {
        if (!name.endsWith('.jsonl')) continue
        const full = join(dirPath, name)
        try {
          const st = statSync(full)
          if (st.isFile() && st.size > 0 && st.size <= MAX_FILE_BYTES) {
            files.push({ path: full, mtimeMs: st.mtimeMs })
          }
        } catch {
          // 跳过失效文件
        }
      }
    }
  } catch {
    return []
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files.slice(0, MAX_FILES_TO_CHECK)
}

function parseSessionTurns(filePath, header) {
  let title = ''
  const turns = []
  let raw = ''
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch {
    return { title: '', turns: [] }
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // 跳过巨型含图行或纯工具结果行，避免无效 JSON.parse 开销
    if (trimmed.includes('"role":"toolResult"') && !trimmed.includes('"type":"session_info"')) {
      continue
    }
    let entry
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (entry?.type === 'session_info' && typeof entry.name === 'string' && entry.name.trim()) {
      title = entry.name.trim()
      continue
    }
    if (entry?.type !== 'message' || !entry.message) continue
    const role = entry.message.role
    if (role !== 'user' && role !== 'assistant') continue
    const text = extractTextOnly(entry.message.content)
    if (!text) continue
    if (!title && role === 'user') title = text.replace(/\s+/g, ' ').slice(0, 60)
    turns.push({ role, text: text.slice(0, 700) })
  }
  return { title: title || header.id || '历史会话', turns }
}

/**
 * 纯本地历史会话检索（借鉴 Hermes session_search）：
 * - 平时 0 token 消耗，仅在模型显式调用时扫描本地 .jsonl 会话；
 * - 从文件头读取真实 cwd（不反推有损目录名），支持中文 2-gram 与英文词元打分。
 */
export function searchPastSessionsRaw(
  agentDir,
  cwd,
  query,
  scope = 'project',
  limit = 5,
  excludeSessionId = null,
) {
  const { exactTerms, ngramTerms } = tokenizeSearchQuery(query)
  if (exactTerms.length === 0 && ngramTerms.length === 0) return []

  const wantNormCwd = scope === 'project' && cwd ? normalizeCwd(cwd) : null
  const files = collectSessionFiles(agentDir)
  const results = []
  let inspected = 0

  for (const file of files) {
    if (inspected >= MAX_MATCHED_SESSIONS) break
    const firstLine = readFirstLine(file.path)
    if (!firstLine) continue
    let header
    try {
      header = JSON.parse(firstLine)
    } catch {
      continue
    }
    if (header?.type !== 'session') continue
    if (excludeSessionId && header.id === excludeSessionId) continue
    if (wantNormCwd && normalizeCwd(header.cwd) !== wantNormCwd) continue

    inspected += 1
    const { title, turns } = parseSessionTurns(file.path, header)
    const titleScore = scoreText(title, exactTerms, ngramTerms) * 1.4
    const scoredTurns = []
    for (let i = 0; i < turns.length; i += 1) {
      const s = scoreText(turns[i].text, exactTerms, ngramTerms)
      if (s > 0) scoredTurns.push({ idx: i, score: s })
    }
    if (titleScore <= 0 && scoredTurns.length === 0) continue

    scoredTurns.sort((a, b) => b.score - a.score)
    const topScore = titleScore + (scoredTurns[0]?.score ?? 0) + (scoredTurns[1]?.score ?? 0) * 0.35
    const snippets = []
    const picked = new Set()
    for (const hit of scoredTurns.slice(0, 2)) {
      if (picked.has(hit.idx)) continue
      picked.add(hit.idx)
      const t = turns[hit.idx]
      const label = t.role === 'user' ? '用户' : '助手'
      let snippet = `${label}: ${t.text.replace(/\s+/g, ' ').slice(0, MAX_SNIPPET_CHARS)}`
      // 若命中的是用户提问，顺带拼上下一条助手回复的开头，提升可读性
      const next = turns[hit.idx + 1]
      if (t.role === 'user' && next?.role === 'assistant' && !picked.has(hit.idx + 1)) {
        snippet += `\n助手: ${next.text.replace(/\s+/g, ' ').slice(0, 220)}`
      }
      snippets.push(snippet)
    }
    if (snippets.length === 0 && turns[0]) {
      snippets.push(`首轮: ${turns[0].text.replace(/\s+/g, ' ').slice(0, MAX_SNIPPET_CHARS)}`)
    }
    results.push({
      sessionId: header.id || '',
      title,
      cwd: header.cwd || '',
      timestamp: typeof header.timestamp === 'string' ? header.timestamp.slice(0, 10) : '',
      mtimeMs: file.mtimeMs,
      score: topScore,
      snippets,
    })
  }

  results.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs)
  return results.slice(0, Math.max(1, Math.min(10, limit)))
}

export function formatSessionSearchHits(hits, query) {
  if (hits.length === 0) return `未在历史会话中检索到与「${query}」相关的记录。`
  let text = hits
    .map((h, i) => {
      const date = h.timestamp ? ` (${h.timestamp})` : ''
      return `${i + 1}. 《${h.title}》${date} [session: ${h.sessionId}]\n${h.snippets.join('\n---\n')}`
    })
    .join('\n\n')
  if (text.length > MAX_OUTPUT_CHARS) {
    text = `${text.slice(0, MAX_OUTPUT_CHARS)}\n…（结果已截断，可换更精准的关键词再次检索）`
  }
  return text
}
