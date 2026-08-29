/**
 * 解析 pi 放在 assistant 消息 errorMessage 里的错误串。
 *
 * 实测遇到过两种形状，都要吃下：
 *   429: {"type":"FreeUsageLimitError","message":"Rate limit exceeded."}
 *   503 {"error":{"code":"model_not_found","message":"No available channel…"}}
 * 前者有冒号、内容在顶层；后者没冒号、内容裹在 error 里。
 * 原样甩给用户等于没说，所以拆成「哪类问题」+「上游原话」+「请求标识」三截。
 */

/** 状态码对应的处置提示。说的是「你该怎么办」，不是复述状态码本身 */
const STATUS_HINT: Record<string, string> = {
  '400': '请求不被模型接受',
  '401': '认证失败，检查 API Key',
  '403': '无权访问该模型',
  '404': '模型或接口不存在，检查模型 ID 与 baseUrl',
  '408': '请求超时',
  '429': '请求过于频繁，或已达该 provider 的用量上限',
  '500': '模型服务内部错误',
  '502': '模型服务网关错误',
  '503': '模型服务暂不可用',
  '529': '模型服务过载',
}

/**
 * 上游 code/type 对应的提示，优先级高于状态码。
 *
 * 因为两者会打架：实测某网关用 503 报 model_not_found，
 * 只看状态码会说成「服务暂不可用」，而真正的问题是这个模型它根本没有渠道——
 * 前者让人去等，后者要人去换模型，方向正好相反。
 */
const CODE_HINT: Record<string, string> = {
  model_not_found: '模型不存在或当前无可用渠道',
  invalid_api_key: 'API Key 无效',
  insufficient_quota: '额度不足',
  context_length_exceeded: '上下文超出该模型上限',
  rate_limit_exceeded: '请求过于频繁',
  FreeUsageLimitError: '已达免费额度上限',
}

/** 上游习惯把请求标识拼进消息里，单独拎出来正文才读得顺 */
const REQUEST_ID = /\s*\(request id:\s*([^)]+)\)/i

export interface ErrorDescription {
  title: string
  /** 上游原话，可能为空 */
  detail?: string
  /** 报障时要用的请求标识 */
  requestId?: string
  /** 用户主动中止，不算故障 */
  aborted: boolean
}

interface Upstream {
  message?: string
  code?: string
}

/** 从上游 JSON 里取消息与错误码。内容可能裹在 error 里，也可能平铺在顶层 */
function parseUpstream(raw: string): Upstream | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const root = parsed as Record<string, unknown>
  const node = (root.error && typeof root.error === 'object' ? root.error : root) as Record<
    string,
    unknown
  >

  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)
  return {
    message: text(node.message),
    // 有 code 用 code，没有才退而用 type——后者常是 new_api_error 这类通用包装
    code: text(node.code) ?? text(node.type),
  }
}

/** 上游 code 说得比状态码准，有就用它 */
function hintFor(status: string, code?: string): string {
  if (code && CODE_HINT[code]) return CODE_HINT[code]
  return STATUS_HINT[status] ?? '请求失败'
}

export function describeError(raw: string): ErrorDescription {
  const text = raw.trim()

  // 中止是用户自己按的停止键，报成红色错误会让人以为出了故障
  if (/\baborted\b/i.test(text)) {
    return { title: '已停止', aborted: true }
  }

  // 状态码与正文之间可能是冒号，也可能只有一个空格
  const matched = /^(\d{3})\s*:?\s+([\s\S]*)$/.exec(text)
  if (!matched) return { title: text, aborted: false }

  const [, status, rest] = matched
  const upstream = parseUpstream(rest)
  const body = upstream?.message ?? rest.trim()
  const requestId = REQUEST_ID.exec(body)?.[1]

  return {
    title: `${hintFor(status, upstream?.code)}（${status}）`,
    detail: body.replace(REQUEST_ID, '').trim() || undefined,
    requestId,
    aborted: false,
  }
}
