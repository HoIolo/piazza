import { extractJsonPayload, pickBackgroundModel } from './memory-auto.mjs'
import {
  containsSensitiveSecret,
  deleteMemoryEntry,
  listScopeMemories,
  readDreamState,
  rebuildScopeIndex,
  saveMemoryEntry,
  VALID_CATEGORIES,
  writeDreamState,
} from './memory-store.mjs'

const AUTO_DREAM_MIN_ITEMS = 8
const AUTO_DREAM_MIN_SESSIONS = 5
const AUTO_DREAM_MIN_HOURS = 24
const AUTO_DREAM_HIGH_WATER_ITEMS = 20
const AUTO_DREAM_HIGH_WATER_HOURS = 6
const MAX_CATALOG_CHARS = 5_400

export function isAutoDreamEnabled(settingsManager) {
  const envVal = (process.env.PIAZZA_MEMORY_AUTO_DREAM || '').trim().toLowerCase()
  if (envVal === '0' || envVal === 'false' || envVal === 'off') return false
  if (envVal === '1' || envVal === 'true' || envVal === 'on') return true
  try {
    const mem = settingsManager?.getSettings?.()?.memory
    if (mem?.enabled === false) return false
    if (mem?.autoDream === false) return false
  } catch {
    // 默认启用
  }
  return true
}

function listAllVisible(root, cwd) {
  return [
    ...listScopeMemories(root, 'global', cwd),
    ...(cwd ? listScopeMemories(root, 'project', cwd) : []),
  ]
}

/** Claude Code Auto-Dream 门控：低频触发，避免浪费 Token */
export function shouldRunAutoDream({ root, cwd, state, nowMs = Date.now() }) {
  const total = listAllVisible(root, cwd).length
  if (total < AUTO_DREAM_MIN_ITEMS) return { run: false, why: 'too_few_items', total }
  const lastMs = state?.lastRunAt ? Date.parse(state.lastRunAt) : Number.NaN
  const hoursSince = Number.isFinite(lastMs) ? (nowMs - lastMs) / 3_600_000 : Infinity
  if (total >= AUTO_DREAM_HIGH_WATER_ITEMS && hoursSince >= AUTO_DREAM_HIGH_WATER_HOURS) {
    return { run: true, why: 'high_water', total }
  }
  if ((state?.sessionsSinceDream ?? 0) >= AUTO_DREAM_MIN_SESSIONS && hoursSince >= AUTO_DREAM_MIN_HOURS) {
    return { run: true, why: 'schedule', total }
  }
  return { run: false, why: 'cooldown', total }
}

/** 0-token 确定性首轮整理：清理泄漏密钥、空内容与完全重复标题，并重建索引 */
export function dedupeDeterministic(root, cwd) {
  const scopes = cwd ? ['global', 'project'] : ['global']
  let removed = 0
  for (const scope of scopes) {
    const items = listScopeMemories(root, scope, cwd)
    const seenTitle = new Map()
    for (const item of items) {
      if (!item.content.trim() || containsSensitiveSecret(`${item.title}\n${item.content}`)) {
        deleteMemoryEntry(root, cwd, scope, item.id)
        removed += 1
        continue
      }
      const key = item.title.trim().replace(/\s+/g, ' ').toLowerCase()
      if (seenTitle.has(key)) {
        // listScopeMemories 已按 updatedAt 倒序，后者更旧，直接清理重复项
        deleteMemoryEntry(root, cwd, scope, item.id)
        removed += 1
      } else {
        seenTitle.set(key, item.id)
      }
    }
    rebuildScopeIndex(root, scope, cwd)
  }
  return removed
}

function extractText(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n')
}

const DREAM_SYSTEM = [
  '你是长期记忆整理器（Dream Consolidator）。请审视现有全局与项目记忆，执行去重、合并冲突与精简，保持记忆库高信噪比。',
  '规则：',
  '1. 若多条记忆主题重叠或矛盾，使用 merge 合并成一条更清晰准确的记忆（保留 targetId，把其余冗余 ID 放入 removeIds）；',
  '2. 若某条记忆明显是一次性临时日志、毫无复用价值，使用 delete 清理；',
  '3. 若某条记忆措辞臃肿或分类不准，使用 update 精简改写；',
  '4. 严禁虚构不存在的事实，严禁保留任何密钥/Token；若记忆库已经很干净，直接返回 {"ops":[]}。',
  '仅输出合法 JSON：',
  '{"ops":[{"action":"merge","scope":"project|global","targetId":"keep-id","removeIds":["dup-id"],"title":"合并后标题","category":"preference|decision|gotcha|workflow|reference|general","summary":"一句话摘要","tags":["tag"],"content":"精炼正文"},{"action":"update","scope":"project|global","id":"id","title":"标题","category":"...","summary":"...","tags":[],"content":"..."},{"action":"delete","scope":"project|global","id":"stale-id"}]}',
].join('\n')

function buildCatalog(items) {
  let out = ''
  for (const item of items) {
    const body = item.content.replace(/\s+/g, ' ').slice(0, 220)
    const entry = `- [${item.scope}] id=${item.id} | cat=${item.category} | updated=${item.updatedAt || 'n/a'} | title=${item.title}\n  summary: ${item.summary}\n  body: ${body}\n`
    if (out.length + entry.length > MAX_CATALOG_CHARS) break
    out += entry
  }
  return out
}

function summarizeDream(merged, updated, deleted, deduped) {
  const parts = []
  if (merged > 0) parts.push(`合并 ${merged} 组`)
  if (updated > 0) parts.push(`精简 ${updated} 条`)
  if (deleted + deduped > 0) parts.push(`清理 ${deleted + deduped} 条`)
  return parts.length > 0 ? `整理完成：${parts.join('，')}` : '当前记忆已足够精简，无需改动'
}

/** 执行完整 Dream 整理（0-token 确定性去重 + 轻量 LLM 语义合并与剪枝） */
export async function runDreamConsolidation({
  root,
  cwd,
  modelRuntime,
  currentModel,
}) {
  const deduped = dedupeDeterministic(root, cwd)
  const items = listAllVisible(root, cwd)
  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  let merged = 0
  let updated = 0
  let deleted = 0
  let modelUsed = null

  const model = pickBackgroundModel(modelRuntime, currentModel)
  if (items.length >= 2 && model && modelRuntime?.completeSimple) {
    modelUsed = `${model.provider}/${model.id}`
    const response = await modelRuntime.completeSimple(
      model,
      {
        systemPrompt: DREAM_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `当前项目: ${cwd || '(无)'}\n共 ${items.length} 条记忆：\n\n${buildCatalog(items)}`,
            timestamp: Date.now(),
          },
        ],
      },
      {
        reasoning: 'off',
        maxTokens: 900,
        signal: AbortSignal.timeout(25_000),
      },
    )

    const parsed = extractJsonPayload(extractText(response?.content))
    const ops = Array.isArray(parsed?.ops) ? parsed.ops : []
    // 安全上限：单次整理最多删除 40% 条目（至少允许删 2 条），防止模型误清空记忆库
    const maxDeletes = Math.max(2, Math.floor(items.length * 0.4))

    for (const op of ops) {
      if (!op || typeof op !== 'object') continue
      const scope = op.scope === 'global' ? 'global' : 'project'
      if (scope === 'project' && !cwd) continue

      if (op.action === 'merge') {
        const targetId = String(op.targetId || '').trim()
        const title = String(op.title || '').trim()
        const content = String(op.content || '').trim()
        const removeIds = Array.isArray(op.removeIds)
          ? op.removeIds.map((x) => String(x || '').trim()).filter((x) => x && x !== targetId)
          : []
        if (!targetId || !title || !content || removeIds.length === 0) continue
        if (containsSensitiveSecret(`${title}\n${op.summary || ''}\n${content}`)) continue
        try {
          saveMemoryEntry(root, cwd, {
            scope,
            id: targetId,
            title,
            category: VALID_CATEGORIES.includes(op.category) ? op.category : 'general',
            summary: typeof op.summary === 'string' ? op.summary : undefined,
            tags: Array.isArray(op.tags) ? op.tags : [],
            content,
          })
          for (const rid of removeIds) {
            if (deleted >= maxDeletes) break
            const res = deleteMemoryEntry(root, cwd, scope, rid)
            if (res.existed) deleted += 1
          }
          merged += 1
        } catch {
          // 跳过单条非法合并
        }
      } else if (op.action === 'update') {
        const id = String(op.id || '').trim()
        const title = String(op.title || '').trim()
        const content = String(op.content || '').trim()
        if (!id || !title || !content) continue
        if (containsSensitiveSecret(`${title}\n${op.summary || ''}\n${content}`)) continue
        try {
          saveMemoryEntry(root, cwd, {
            scope,
            id,
            title,
            category: VALID_CATEGORIES.includes(op.category) ? op.category : 'general',
            summary: typeof op.summary === 'string' ? op.summary : undefined,
            tags: Array.isArray(op.tags) ? op.tags : [],
            content,
          })
          updated += 1
        } catch {
          // 跳过单条非法更新
        }
      } else if (op.action === 'delete' && deleted < maxDeletes) {
        const id = String(op.id || '').trim()
        if (!id) continue
        try {
          const res = deleteMemoryEntry(root, cwd, scope, id)
          if (res.existed) deleted += 1
        } catch {
          // 跳过非法 ID
        }
      }
    }
  }

  const summary = summarizeDream(merged, updated, deleted, deduped)
  writeDreamState(root, {
    lastRunAt: nowIso,
    sessionsSinceDream: 0,
    lastSummary: summary,
  })
  return { ok: true, merged, updated, deleted: deleted + deduped, modelUsed, summary, lastRunAt: nowIso }
}

export function bumpDreamSessionCounter(root) {
  const state = readDreamState(root)
  return writeDreamState(root, {
    ...state,
    sessionsSinceDream: state.sessionsSinceDream + 1,
  })
}
