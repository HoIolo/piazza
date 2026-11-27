import {
  containsSensitiveSecret,
  deleteMemoryEntry,
  listScopeMemories,
  saveMemoryEntry,
  VALID_CATEGORIES,
} from './memory-store.mjs'

const MAX_TRANSCRIPT_CHARS = 3_200
const MAX_INDEX_CHARS = 1_200
const BATCH_MIN_USER_TURNS = 4
const BATCH_MIN_CHARS = 700
const BATCH_COOLDOWN_MS = 90_000
const MAX_OPS_PER_RUN = 3

const CHEAP_MODEL_PATTERNS = [
  'haiku',
  'flash-lite',
  'flash',
  'mini',
  'nano',
  'small',
  'fast',
  'turbo',
  'deepseek-chat',
  'glm-4-flash',
  'glm-4-air',
]

const EXCLUDED_MODEL_PATTERNS = ['embedding', 'tts', 'whisper', 'image', 'audio', 'moderation', 'rerank']

const STRONG_SIGNAL_PATTERNS = [
  /记住|记一下|帮我记|以后都|以后一律|下次记得|别忘了|不要再|别再|千万别|永远不要|禁止(?:使用|改动|修改|提交)/,
  /默认用|统一用|一律用|习惯用|偏好|我喜欢用|每次都要|始终用/,
  /(?:不对|搞错了|搞反了|不是这样)[，。,\s!?！？]|别用.{1,20}(?:改用|换成)|不要用.{1,20}(?:改用|用)/,
  /\b(?:remember\s+(?:that|to)|from\s+now\s+on|always\s+use|never\s+use|don'?t\s+use|stop\s+using|i\s+prefer|my\s+preference|instead\s+of\s+using)\b/i,
]

export function getAutoExtractMode(settingsManager) {
  const envVal = (process.env.PIAZZA_MEMORY_AUTO_EXTRACT || '').trim().toLowerCase()
  if (envVal === 'smart' || envVal === 'signal' || envVal === 'off') return envVal
  try {
    const mode = settingsManager?.getSettings?.()?.memory?.autoExtract
    if (mode === 'smart' || mode === 'signal' || mode === 'off') return mode
  } catch {
    // 忽略设置读取异常
  }
  return 'smart'
}

/** 优先从当前会话同 provider 下挑便宜快速模型（已认证），找不到再回退当前模型 */
export function pickBackgroundModel(modelRuntime, currentModel) {
  if (!currentModel) return undefined
  try {
    const available = modelRuntime?.getAvailableSnapshot?.() ?? []
    const sameProvider = available.filter((m) => {
      if (!m || m.provider !== currentModel.provider) return false
      const id = String(m.id || '').toLowerCase()
      if (EXCLUDED_MODEL_PATTERNS.some((bad) => id.includes(bad))) return false
      return CHEAP_MODEL_PATTERNS.some((tier) => id.includes(tier))
    })
    if (sameProvider.length > 0) {
      sameProvider.sort((a, b) => {
        const ca = typeof a.cost?.input === 'number' ? a.cost.input : 999
        const cb = typeof b.cost?.input === 'number' ? b.cost.input : 999
        if (ca !== cb) return ca - cb
        const ia = CHEAP_MODEL_PATTERNS.findIndex((p) => String(a.id).toLowerCase().includes(p))
        const ib = CHEAP_MODEL_PATTERNS.findIndex((p) => String(b.id).toLowerCase().includes(p))
        return ia - ib
      })
      const best = sameProvider[0]
      const bestCost = typeof best.cost?.input === 'number' ? best.cost.input : null
      const curCost = typeof currentModel.cost?.input === 'number' ? currentModel.cost.input : null
      if (bestCost === null || curCost === null || bestCost <= curCost) return best
    }
  } catch {
    // 回退当前会话模型
  }
  return currentModel
}

export function hasStrongMemorySignal(text) {
  const value = String(text || '').trim()
  if (value.length < 4) return false
  return STRONG_SIGNAL_PATTERNS.some((re) => re.test(value))
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

function extractToolCalls(content) {
  if (!Array.isArray(content)) return []
  return content.filter((b) => b?.type === 'toolCall' && typeof b.name === 'string')
}

/**
 * 构造极简增量对话摘要（仅取 startIndex 之后的未处理消息）：
 * - 剥离大段文件正文、Diff、思考链和图片，避免后台提炼烧 Token；
 * - 保留用户原话、助手结论以及工具报错/关键命令线索。
 */
export function buildDeltaTranscript(messages, startIndex = 0) {
  const list = Array.isArray(messages) ? messages.slice(Math.max(0, startIndex)) : []
  const lines = []
  let userTurnCount = 0
  let toolCount = 0
  let hadManualMemoryWrite = false
  let latestUserText = ''

  for (const msg of list) {
    if (!msg) continue
    if (msg.role === 'user') {
      const text = extractText(msg.content)
      if (!text || text.startsWith('/')) continue
      userTurnCount += 1
      latestUserText = text
      lines.push(`User: ${text.replace(/\s+/g, ' ').slice(0, 420)}`)
    } else if (msg.role === 'assistant') {
      const calls = extractToolCalls(msg.content)
      for (const c of calls) {
        toolCount += 1
        if (c.name === 'memory_write' || c.name === 'memory_delete') {
          hadManualMemoryWrite = true
        }
      }
      const text = extractText(msg.content)
      if (text) {
        lines.push(`Assistant: ${text.replace(/\s+/g, ' ').slice(0, 480)}`)
      }
    } else if (msg.role === 'toolResult') {
      if (msg.toolName === 'memory_write' || msg.toolName === 'memory_delete') {
        hadManualMemoryWrite = true
        continue
      }
      if (msg.isError) {
        const errText = extractText(msg.content).replace(/\s+/g, ' ').slice(0, 140)
        if (errText) lines.push(`[ToolError:${msg.toolName || 'tool'}] ${errText}`)
      }
    }
  }

  let transcript = lines.join('\n')
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = `…(前文已裁剪)\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`
  }
  return {
    transcript,
    userTurnCount,
    toolCount,
    charCount: transcript.length,
    hadManualMemoryWrite,
    latestUserText,
  }
}

/** 0-token 本地门控：过滤掉无需提炼的闲聊与已由主模型自行落盘的回合 */
export function shouldTriggerAutoExtract({
  mode,
  delta,
  lastExtractAtMs = 0,
  reason = 'agent_end',
  nowMs = Date.now(),
}) {
  if (mode === 'off') return { run: false, why: 'off' }
  if (!delta || delta.userTurnCount <= 0 || !delta.transcript) return { run: false, why: 'empty' }
  if (delta.hadManualMemoryWrite) return { run: false, why: 'model_already_wrote' }

  if (hasStrongMemorySignal(delta.latestUserText)) {
    return { run: true, why: 'strong_signal' }
  }
  if (mode === 'signal') return { run: false, why: 'signal_only' }

  if (reason === 'compact' && delta.userTurnCount >= 2) {
    return { run: true, why: 'pre_compact' }
  }
  if (
    reason === 'agent_end' &&
    delta.userTurnCount >= BATCH_MIN_USER_TURNS &&
    (delta.toolCount >= 2 || delta.charCount >= BATCH_MIN_CHARS) &&
    nowMs - lastExtractAtMs >= BATCH_COOLDOWN_MS
  ) {
    return { run: true, why: 'batch_delta' }
  }
  return { run: false, why: 'below_threshold' }
}

export function extractJsonPayload(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

function buildExistingIndex(root, cwd) {
  const items = [
    ...listScopeMemories(root, 'global', cwd),
    ...(cwd ? listScopeMemories(root, 'project', cwd) : []),
  ]
  if (items.length === 0) return '（暂无已有记忆）'
  let text = items
    .map((m) => `- [${m.scope}] id=${m.id} (${m.category}) ${m.title}: ${m.summary}`)
    .join('\n')
  if (text.length > MAX_INDEX_CHARS) text = `${text.slice(0, MAX_INDEX_CHARS)}\n…`
  return text
}

const AUTO_EXTRACT_SYSTEM = [
  '你是编程助手的后台长期记忆提炼器。请严格从以下增量对话片段中判断是否出现了**值得跨会话长期保留**的信息。',
  '只保留高信噪比信息：',
  '1. 用户明确表达的个人偏好/沟通风格/工具偏好（scope: "global"）或用户纠正助手的错误习惯；',
  '2. 当前项目非显而易见的构建/测试/签名命令、环境坑位（gotcha）、稳定架构约定（scope: "project"）。',
  '严禁保存：一次性任务进展、普通代码问答、看一眼代码或 git log 就知道的常识、任何 API Key/Token/密码。',
  '更新已有主题时必须复用已有索引里的 id；若无真正值得长期记住的新信息，直接返回 {"ops":[]}。',
  '仅输出合法 JSON，格式：',
  '{"ops":[{"action":"save","scope":"project|global","id":"optional-slug","title":"简短标题","category":"preference|decision|gotcha|workflow|reference|general","summary":"一句话摘要","tags":["tag"],"content":"清晰简洁的 Markdown 正文"},{"action":"delete","scope":"project|global","id":"obsolete-id"}]}',
  `每次最多返回 ${MAX_OPS_PER_RUN} 条操作。`,
].join('\n')

/** 执行一次低成本异步记忆提炼（reasoning: off，严格安全与去重校验） */
export async function runAutoExtract({
  root,
  cwd,
  delta,
  modelRuntime,
  currentModel,
  reason = 'agent_end',
}) {
  const model = pickBackgroundModel(modelRuntime, currentModel)
  if (!model || !modelRuntime?.completeSimple) {
    return { ran: false, saved: [], deleted: [], skippedSecrets: 0, modelUsed: null, reason }
  }

  const indexText = buildExistingIndex(root, cwd)
  const userPrompt = [
    `当前项目路径: ${cwd || '(无)'}`,
    `触发原因: ${reason}`,
    '',
    '## 已有记忆索引（若同主题请复用 id 覆盖）',
    indexText,
    '',
    '## 本次新增对话增量',
    delta.transcript,
  ].join('\n')

  const response = await modelRuntime.completeSimple(
    model,
    {
      systemPrompt: AUTO_EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: userPrompt, timestamp: Date.now() }],
    },
    {
      reasoning: 'off',
      maxTokens: 450,
      signal: AbortSignal.timeout(18_000),
    },
  )

  const rawText = extractText(response?.content)
  const parsed = extractJsonPayload(rawText)
  const ops = Array.isArray(parsed?.ops) ? parsed.ops.slice(0, MAX_OPS_PER_RUN) : []
  const saved = []
  const deleted = []
  let skippedSecrets = 0

  for (const op of ops) {
    if (!op || typeof op !== 'object') continue
    const scope = op.scope === 'global' ? 'global' : 'project'
    if (scope === 'project' && !cwd) continue

    if (op.action === 'delete' && typeof op.id === 'string' && op.id.trim()) {
      try {
        const res = deleteMemoryEntry(root, cwd, scope, op.id)
        if (res.existed) deleted.push(`${scope}:${res.id}`)
      } catch {
        // 忽略非法 ID
      }
      continue
    }

    if (op.action === 'save') {
      const title = String(op.title || '').trim()
      const content = String(op.content || '').trim()
      if (!title || !content) continue
      if (containsSensitiveSecret(`${title}\n${op.summary || ''}\n${content}`)) {
        skippedSecrets += 1
        continue
      }
      const category = VALID_CATEGORIES.includes(op.category) ? op.category : 'general'
      try {
        const item = saveMemoryEntry(root, cwd, {
          scope,
          id: typeof op.id === 'string' && op.id.trim() ? op.id.trim() : undefined,
          title,
          category,
          summary: typeof op.summary === 'string' ? op.summary : undefined,
          tags: Array.isArray(op.tags) ? op.tags : [],
          content,
        })
        saved.push(`${item.scope}:${item.id}`)
      } catch {
        // 忽略单条校验失败，不影响其余条目
      }
    }
  }

  return {
    ran: true,
    saved,
    deleted,
    skippedSecrets,
    modelUsed: `${model.provider}/${model.id}`,
    reason,
  }
}
