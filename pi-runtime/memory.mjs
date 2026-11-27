import { Type } from 'typebox'
import {
  buildDeltaTranscript,
  getAutoExtractMode,
  runAutoExtract,
  shouldTriggerAutoExtract,
} from './memory-auto.mjs'
import {
  bumpDreamSessionCounter,
  isAutoDreamEnabled,
  runDreamConsolidation,
  shouldRunAutoDream,
} from './memory-dream.mjs'
import { formatSessionSearchHits, searchPastSessionsRaw } from './memory-sessions.mjs'
import {
  containsSensitiveSecret,
  deleteMemoryEntry,
  listScopeMemories,
  memoryRevisionStamp,
  readMemoryEntry,
  readProjectHandoff,
  resolveMemoryRoot,
  saveMemoryEntry,
  searchMemories,
  VALID_CATEGORIES,
  writeProjectHandoff,
} from './memory-store.mjs'

const GLOBAL_INLINE_BUDGET = 2_400
const PROJECT_INLINE_BUDGET = 3_600
const INDEX_OVERFLOW_BUDGET = 2_400
const MAX_HANDOFF_CHARS = 2_000

const CATEGORY_PRIORITY = {
  preference: 5,
  workflow: 4,
  gotcha: 4,
  decision: 3,
  reference: 2,
  general: 1,
}

const MEMORY_GUIDANCE = [
  '## 长期记忆与历史检索准则',
  '- 上方高优先级记忆已以会话级冻结快照内联全文，开局即生效；若下方存在「其余索引」，按需调用 `memory_read(scope, id)` 或 `memory_search(query)` 取回。',
  '- 若需要回查过往对话里排查过的细节、报错或讨论背景，可调用 `session_search(query)` 检索本项目本地历史会话（平时 0 消耗，按需触发）。',
  '- **何时必须立刻调用 `memory_write`**：',
  '  1. 用户明确说出「记住…」「以后都…」「不要再…」等指令时，**本轮直接调用 `memory_write` 落盘**，切勿只口头答应；',
  '  2. 用户纠正你的错误做法时，沉淀为 `gotcha` 或 `preference`（写清规则与原因）；',
  '  3. 发现非显而易见的项目构建/测试/打包命令、环境坑位或稳定架构决策时，记入 `project` 作用域。',
  '- **严禁写入**：API Key / Token / 密码等敏感凭证、看一眼代码或 `git log` 就能确认的常规事实、单次任务临时状态。',
  '- **去重与维护**：更新同一主题时复用原 `id` 覆盖（或保持原标题自动覆盖）；发现已过时/冲突记忆时调用 `memory_delete` 清理。',
].join('\n')

function isMemoryEnabled(settingsManager) {
  const envFlag = (process.env.PIAZZA_MEMORY_ENABLED || '').trim().toLowerCase()
  if (envFlag === '0' || envFlag === 'false' || envFlag === 'off') return false
  try {
    const raw = settingsManager?.getSettings?.()
    if (raw?.memory && raw.memory.enabled === false) return false
  } catch {
    // 忽略设置读取异常，默认启用
  }
  return true
}

function sortByRecallPriority(items) {
  return [...items].sort((a, b) => {
    const pa = CATEGORY_PRIORITY[a.category] ?? 1
    const pb = CATEGORY_PRIORITY[b.category] ?? 1
    if (pa !== pb) return pb - pa
    return (b.updatedAt || '').localeCompare(a.updatedAt || '')
  })
}

function renderScopeMemories(heading, items, inlineBudget) {
  if (items.length === 0) return ''
  const ordered = sortByRecallPriority(items)
  const inlined = []
  const overflow = []
  let used = 0

  for (const item of ordered) {
    const tags = item.tags.length ? ` ${item.tags.map((t) => `#${t}`).join(' ')}` : ''
    const block = `#### ${item.title} (id: ${item.id}, ${item.category})${tags}\n${item.content}`
    if (used + block.length <= inlineBudget) {
      inlined.push(block)
      used += block.length + 2
    } else {
      overflow.push(`- ${item.title} (id: ${item.id}, ${item.category})${tags} — ${item.summary}`)
    }
  }

  const parts = [`### ${heading}`]
  if (inlined.length > 0) parts.push(inlined.join('\n\n'))
  if (overflow.length > 0) {
    let idxText = overflow.join('\n')
    if (idxText.length > INDEX_OVERFLOW_BUDGET) {
      idxText = `${idxText.slice(0, INDEX_OVERFLOW_BUDGET)}\n…（更多条目可用 memory_search 检索）`
    }
    parts.push(`#### 其余索引（按需用 memory_read 读取）\n${idxText}`)
  }
  return parts.join('\n\n')
}

function buildMemoryPromptBlock(root, cwd, currentSessionId) {
  const sections = []
  const globalItems = listScopeMemories(root, 'global', cwd)
  const globalSec = renderScopeMemories('全局记忆（跨项目）', globalItems, GLOBAL_INLINE_BUDGET)
  if (globalSec) sections.push(globalSec)

  if (cwd) {
    const projectItems = listScopeMemories(root, 'project', cwd)
    const projectSec = renderScopeMemories('当前项目记忆', projectItems, PROJECT_INLINE_BUDGET)
    if (projectSec) sections.push(projectSec)

    const handoff = readProjectHandoff(root, cwd)
    if (handoff?.content && handoff.sessionId && currentSessionId && handoff.sessionId === currentSessionId) {
      const capped =
        handoff.content.length > MAX_HANDOFF_CHARS
          ? `${handoff.content.slice(0, MAX_HANDOFF_CHARS)}…`
          : handoff.content
      sections.push(`### 本会话压缩交接快照\n${capped}`)
    }
  }

  const body = sections.length > 0 ? sections.join('\n\n') : '（当前尚无已保存记忆）'
  return `<piazza-memory>\n${body}\n\n${MEMORY_GUIDANCE}\n</piazza-memory>`
}

function extractMessageText(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n')
}

function buildCompactionHandoff(branchEntries) {
  const entries = Array.isArray(branchEntries) ? branchEntries : []
  const recentUsers = []
  let lastAssistant = ''
  let openTodos = []

  for (const entry of entries) {
    if (entry?.type !== 'message' || !entry.message) continue
    const msg = entry.message
    if (msg.role === 'user') {
      const text = extractMessageText(msg.content)
      if (text && !text.startsWith('/')) recentUsers.push(text.slice(0, 240))
    } else if (msg.role === 'assistant') {
      const text = extractMessageText(msg.content)
      if (text) lastAssistant = text.slice(0, 500)
    } else if (msg.role === 'toolResult' && msg.toolName === 'piazza_update_plan') {
      const todos = msg.details?.todos
      if (Array.isArray(todos)) {
        openTodos = todos.filter((t) => t?.status !== 'completed' && t?.text)
      }
    }
  }

  const parts = [`# 压缩前任务交接（${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}）`]
  if (recentUsers.length > 0) {
    parts.push('## 最近用户目标', ...recentUsers.slice(-3).map((u) => `- ${u.replace(/\s+/g, ' ')}`))
  }
  if (openTodos.length > 0) {
    parts.push('## 未完成待办', ...openTodos.map((t) => `- [${t.status}] ${t.text}`))
  }
  if (lastAssistant) {
    parts.push('## 压缩前最近进展', lastAssistant)
  }
  return parts.length > 1 ? parts.join('\n\n') : ''
}

function formatEntryDetail(item) {
  const tags = item.tags.length ? item.tags.map((t) => `#${t}`).join(' ') : '无'
  return [
    `[${item.scope}] ${item.title} (id: ${item.id})`,
    `分类: ${item.category} | 标签: ${tags} | 更新: ${item.updatedAt || '未知'}`,
    item.summary ? `摘要: ${item.summary}` : '',
    '',
    item.content,
  ]
    .filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''))
    .join('\n')
}

function disabledResult() {
  return {
    content: [{ type: 'text', text: 'Piazza 内置记忆当前已在设置中关闭。' }],
    details: { disabled: true },
  }
}

/**
 * Piazza 内置第一梯队双层记忆扩展：
 * 1. Frozen Snapshot（Hermes / Magic Context 护缓存机制）：会话启动与压缩后冻结 systemPrompt 快照，
 *    会话中 Agent 写入或后台自动提炼仅落盘、不打穿当前会话 Prompt Cache，而用户在设置页手动改动可即时感知；
 * 2. 低频门控后台自动提炼（Claude Code + Codex）：0-token 本地强信号/批量门控 + 优先轻量模型 + reasoning: off；
 * 3. 纯本地 `session_search` 历史会话检索（Hermes 思路）：平时 0 消耗，按需查本项目过往对话；
 * 4. 低频自动 + 设置页一键手动 Dream 整理去重（Claude Code Auto-Dream）。
 */
export function createMemoryExtension({
  cwd,
  agentDir,
  settingsManager,
  getSessionId,
  getSession,
  getModelRuntime,
  isPersisted,
  onController,
}) {
  const root = resolveMemoryRoot(agentDir)
  let frozenBlock = null
  let frozenSessionKey = ''
  let acknowledgedStamp = ''
  let compactionEpoch = 0

  let lastExtractedMsgCount = 0
  let lastExtractAtMs = 0
  let extractInFlight = false
  let dreamInFlight = false

  const resolveSessionId = (ctx) =>
    ctx?.sessionManager?.getSessionId?.() ?? getSessionId?.() ?? ''

  const currentPersisted = (ctx) => {
    if (typeof ctx?.sessionManager?.isPersisted === 'function') {
      return ctx.sessionManager.isPersisted()
    }
    return typeof isPersisted === 'function' ? isPersisted() : true
  }

  /** 内部写入（memory_write / auto-extract / dream）后静默推进已确认指纹，绝不破坏当前会话 Prompt Cache */
  const acknowledgeSelfMutation = (sessionId) => {
    acknowledgedStamp = memoryRevisionStamp(root, cwd, sessionId)
  }

  const unfreezeSnapshot = () => {
    frozenBlock = null
    frozenSessionKey = ''
    acknowledgedStamp = ''
  }

  const getFrozenSnapshot = (sessionId) => {
    const key = `${sessionId || ''}#${compactionEpoch}`
    const stamp = memoryRevisionStamp(root, cwd, sessionId)
    // 仅在首次/切换会话/压缩后，或用户在设置页/外部编辑器手动改盘导致 stamp 偏离时才重建快照
    if (frozenBlock === null || key !== frozenSessionKey || stamp !== acknowledgedStamp) {
      frozenBlock = buildMemoryPromptBlock(root, cwd, sessionId)
      frozenSessionKey = key
      acknowledgedStamp = stamp
    }
    return frozenBlock
  }

  const consolidateNow = async () => {
    if (dreamInFlight) {
      return { ok: false, error: '记忆整理正在进行中，请稍候' }
    }
    dreamInFlight = true
    try {
      const session = getSession?.()
      const res = await runDreamConsolidation({
        root,
        cwd,
        modelRuntime: getModelRuntime?.(),
        currentModel: session?.model,
      })
      acknowledgeSelfMutation(resolveSessionId())
      return res
    } finally {
      dreamInFlight = false
    }
  }

  if (typeof onController === 'function') {
    onController({ consolidateNow, unfreezeSnapshot })
  }

  const triggerBackgroundExtract = (messages, reason, sessionId) => {
    if (extractInFlight || !isMemoryEnabled(settingsManager)) return
    const mode = getAutoExtractMode(settingsManager)
    if (mode === 'off') return
    const list = Array.isArray(messages) ? messages : []
    if (list.length < lastExtractedMsgCount) lastExtractedMsgCount = 0
    const delta = buildDeltaTranscript(list, lastExtractedMsgCount)
    if (delta.hadManualMemoryWrite) {
      lastExtractedMsgCount = list.length
      return
    }
    const decision = shouldTriggerAutoExtract({
      mode,
      delta,
      lastExtractAtMs,
      reason,
    })
    if (!decision.run) return

    const session = getSession?.()
    const modelRuntime = getModelRuntime?.()
    if (!session?.model || !modelRuntime?.completeSimple) return

    lastExtractedMsgCount = list.length
    lastExtractAtMs = Date.now()
    extractInFlight = true
    void runAutoExtract({
      root,
      cwd,
      delta,
      modelRuntime,
      currentModel: session.model,
      reason: decision.why,
    })
      .then((res) => {
        if (res.saved.length > 0 || res.deleted.length > 0) {
          acknowledgeSelfMutation(sessionId)
        }
      })
      .catch(() => {
        // 后台提炼静默降级，绝不干扰主对话
      })
      .finally(() => {
        extractInFlight = false
      })
  }

  return function piazzaMemoryExtension(pi) {
    pi.on('session_start', (event, ctx) => {
      unfreezeSnapshot()
      const session = getSession?.()
      lastExtractedMsgCount = Array.isArray(session?.messages) ? session.messages.length : 0
      const sid = resolveSessionId(ctx)
      if (!isMemoryEnabled(settingsManager)) return
      getFrozenSnapshot(sid)

      if (!currentPersisted(ctx) || dreamInFlight || !isAutoDreamEnabled(settingsManager)) return
      if (event?.reason === 'startup' || event?.reason === 'new') {
        const state = bumpDreamSessionCounter(root)
        const gate = shouldRunAutoDream({ root, cwd, state })
        if (gate.run && getModelRuntime?.()) {
          // 延后数秒异步整理，避免和首轮冷启竞争 CPU / 网络
          setTimeout(() => {
            const cur = getSession?.()
            if (!cur?.model || dreamInFlight) return
            void consolidateNow().catch(() => undefined)
          }, 4_000)
        }
      }
    })

    pi.on('before_agent_start', async (event, ctx) => {
      try {
        await settingsManager?.reload?.()
      } catch {
        // 忽略设置重载失败
      }
      if (!isMemoryEnabled(settingsManager)) return undefined
      const block = getFrozenSnapshot(resolveSessionId(ctx))
      if (!block) return undefined
      return { systemPrompt: `${event.systemPrompt}\n\n${block}` }
    })

    pi.on('agent_end', (event, ctx) => {
      if (!currentPersisted(ctx)) return
      const session = getSession?.()
      const messages = Array.isArray(session?.messages) && session.messages.length > 0
        ? session.messages
        : event?.messages
      triggerBackgroundExtract(messages, 'agent_end', resolveSessionId(ctx))
    })

    pi.on('session_before_compact', (event, ctx) => {
      if (!isMemoryEnabled(settingsManager)) return
      const sid = resolveSessionId(ctx)
      if (cwd) {
        try {
          const handoff = buildCompactionHandoff(event.branchEntries)
          if (handoff) {
            writeProjectHandoff(root, cwd, handoff, sid)
          }
        } catch {
          // 交接快照失败不应阻断压缩流程
        }
      }
      if (currentPersisted(ctx) && Array.isArray(event.branchEntries)) {
        const msgs = event.branchEntries
          .filter((e) => e?.type === 'message' && e.message)
          .map((e) => e.message)
        triggerBackgroundExtract(msgs, 'compact', sid)
      }
    })

    pi.on('session_compact', (_event, ctx) => {
      compactionEpoch += 1
      unfreezeSnapshot()
      const session = getSession?.()
      lastExtractedMsgCount = Array.isArray(session?.messages) ? session.messages.length : 0
      if (isMemoryEnabled(settingsManager)) getFrozenSnapshot(resolveSessionId(ctx))
    })

    pi.registerTool({
      name: 'memory_write',
      label: '写入记忆',
      description:
        '保存或更新一条长期记忆（Markdown 文件，按全局或当前项目隔离）。用户要求记住、纠正做法或发现非显而易见的项目规则/命令/踩坑时立即调用。同主题复用原 id 覆盖，严禁写入密钥或一次性临时细节。',
      parameters: Type.Object({
        scope: Type.Union([Type.Literal('project'), Type.Literal('global')], {
          description: 'project 仅当前项目生效（项目约定/构建命令/踩坑）；global 跨所有项目生效（个人偏好）',
        }),
        id: Type.Optional(
          Type.String({ description: '英文 slug ID（如 pnpm-workflow）；更新已有记忆时传入原 id，留空则按标题自动匹配或生成' }),
        ),
        title: Type.String({ minLength: 1, description: '简短清晰的标题' }),
        category: Type.Optional(
          Type.Union(
            VALID_CATEGORIES.map((c) => Type.Literal(c)),
            { description: '分类：preference / decision / gotcha / workflow / reference / general' },
          ),
        ),
        summary: Type.Optional(Type.String({ description: '一句话摘要，用于索引与检索' })),
        tags: Type.Optional(Type.Array(Type.String(), { maxItems: 12, description: '便于搜索的标签列表' })),
        content: Type.String({ minLength: 1, description: 'Markdown 格式的详细记忆正文' }),
      }),
      async execute(_toolCallId, params) {
        if (!isMemoryEnabled(settingsManager)) return disabledResult()
        if (containsSensitiveSecret(`${params.title}\n${params.summary || ''}\n${params.content}`)) {
          return {
            content: [{ type: 'text', text: '拒绝写入：检测到疑似 API Key、Token 或私钥等敏感凭证，请脱敏后再保存。' }],
            details: { rejectedSecret: true },
          }
        }
        const saved = saveMemoryEntry(root, cwd, params)
        // 写盘后静默推进已确认指纹，保持当前会话冻结前缀不打穿 Prompt Cache
        acknowledgeSelfMutation(resolveSessionId())
        return {
          content: [
            {
              type: 'text',
              text: `已保存${saved.scope === 'global' ? '全局' : '项目'}记忆「${saved.title}」(id: ${saved.id})`,
            },
          ],
          details: { memory: saved },
        }
      },
    })

    pi.registerTool({
      name: 'memory_read',
      label: '读取记忆',
      description: '读取指定记忆条目的完整正文；若未传 id，则列出该作用域下全部记忆摘要。',
      parameters: Type.Object({
        scope: Type.Union([Type.Literal('project'), Type.Literal('global'), Type.Literal('all')], {
          description: 'project / global / all',
        }),
        id: Type.Optional(Type.String({ description: '记忆条目 ID（不含 .md 后缀）；留空列出全部' })),
      }),
      async execute(_toolCallId, { scope, id }) {
        if (!isMemoryEnabled(settingsManager)) return disabledResult()
        if (id) {
          const scopes = scope === 'all' ? ['project', 'global'] : [scope]
          for (const s of scopes) {
            try {
              const found = readMemoryEntry(root, cwd, s, id)
              if (found) {
                return {
                  content: [{ type: 'text', text: formatEntryDetail(found) }],
                  details: { memory: found },
                }
              }
            } catch {
              // 继续尝试下一个 scope
            }
          }
          return {
            content: [{ type: 'text', text: `未找到记忆条目：${id}` }],
            details: { found: false },
          }
        }
        const scopes = scope === 'all' ? ['project', 'global'] : [scope]
        const items = scopes.flatMap((s) => {
          try {
            return listScopeMemories(root, s, cwd)
          } catch {
            return []
          }
        })
        if (items.length === 0) {
          return { content: [{ type: 'text', text: '当前没有已保存的记忆。' }], details: { count: 0 } }
        }
        const lines = items.map(
          (m) => `- [${m.scope}] ${m.title} (id: ${m.id}, ${m.category}) — ${m.summary}`,
        )
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          details: { count: items.length },
        }
      },
    })

    pi.registerTool({
      name: 'memory_search',
      label: '检索记忆',
      description: '按中英文关键词、标题、标签、分类或正文检索全局与当前项目的历史记忆（支持无空格中文查询，毫秒级返回）。',
      parameters: Type.Object({
        query: Type.String({ minLength: 1, description: '搜索关键词（支持中文短语与英文词）' }),
        scope: Type.Optional(
          Type.Union([Type.Literal('all'), Type.Literal('project'), Type.Literal('global')]),
        ),
        category: Type.Optional(Type.Union(VALID_CATEGORIES.map((c) => Type.Literal(c)))),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
      }),
      async execute(_toolCallId, { query, scope = 'all', category, limit = 8 }) {
        if (!isMemoryEnabled(settingsManager)) return disabledResult()
        const hits = searchMemories(root, cwd, query, scope, limit, category)
        if (hits.length === 0) {
          return {
            content: [{ type: 'text', text: `未检索到与「${query}」相关的记忆。` }],
            details: { count: 0 },
          }
        }
        const text = hits.map((m) => formatEntryDetail(m)).join('\n\n---\n\n')
        return {
          content: [{ type: 'text', text }],
          details: { count: hits.length, ids: hits.map((m) => m.id) },
        }
      },
    })

    pi.registerTool({
      name: 'memory_delete',
      label: '删除记忆',
      description: '删除一条过时、错误或用户要求遗忘的记忆条目，并同步更新索引。',
      parameters: Type.Object({
        scope: Type.Union([Type.Literal('project'), Type.Literal('global')]),
        id: Type.String({ minLength: 1, description: '要删除的记忆 ID（不含 .md 后缀）' }),
      }),
      async execute(_toolCallId, { scope, id }) {
        if (!isMemoryEnabled(settingsManager)) return disabledResult()
        const res = deleteMemoryEntry(root, cwd, scope, id)
        acknowledgeSelfMutation(resolveSessionId())
        return {
          content: [
            {
              type: 'text',
              text: res.existed ? `已删除${scope === 'global' ? '全局' : '项目'}记忆：${res.id}` : `未找到记忆：${res.id}`,
            },
          ],
          details: res,
        }
      },
    })

    pi.registerTool({
      name: 'session_search',
      label: '检索历史会话',
      description:
        '检索本项目（或全部项目）本地保存的历史对话记录（.jsonl），用于回查之前排障过程、历史决策背景或上次讨论内容。平时零消耗，仅按需调用。',
      parameters: Type.Object({
        query: Type.String({ minLength: 1, description: '要回查的中英文关键词或短语' }),
        scope: Type.Optional(
          Type.Union([Type.Literal('project'), Type.Literal('all')], {
            description: 'project 仅搜当前项目历史会话（默认）；all 跨项目搜索',
          }),
        ),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
      }),
      async execute(_toolCallId, { query, scope = 'project', limit = 5 }) {
        if (!isMemoryEnabled(settingsManager)) return disabledResult()
        const hits = searchPastSessionsRaw(agentDir, cwd, query, scope, limit, resolveSessionId())
        return {
          content: [{ type: 'text', text: formatSessionSearchHits(hits, query) }],
          details: { count: hits.length, sessionIds: hits.map((h) => h.sessionId) },
        }
      },
    })
  }
}
