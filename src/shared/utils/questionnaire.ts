/**
 * 结构化问卷：把「一次问多个问题」塞进 pi 的 select 通道。
 *
 * pi 的扩展 UI 只有 select / confirm / input / editor 四种方法，RPC 模式下
 * 一次 select 只能问一个问题、且只能单选。要做出 Codex 那种「一屏多题、
 * 可翻页、可多选、可自填」的面板，扩展只能把整个问卷编码进 title——
 * 客户端认得这个前缀就渲染成面板，不认得就退化成一串普通选项。
 *
 * 认不出前缀的客户端会看到一串 JSON 选项，所以扩展那边保留了「拿不到结构化
 * 回答就逐题退回普通 select」的兜底路径。
 */

export interface QuestionOption {
  label: string
  description?: string
  /** 推荐项：标签右侧显示「推荐」徽标（对齐 Codex 的 Recommended） */
  recommended?: boolean
}

export interface Question {
  question: string
  header?: string
  options: QuestionOption[]
  multiSelect?: boolean
}

/** 用户对某一题的作答 */
export interface QuestionAnswer {
  index: number
  /** 选中的选项 label；多选时有多个 */
  selected: string[]
  /** 「自己填」的原文，有值时 selected 为空 */
  custom?: string
}

export const QUESTIONNAIRE_MARKER = 'piazza:questions:'

/** 从 title 里解出问卷；不是结构化请求时返回 null */
export function parseQuestionnaire(title?: string): Question[] | null {
  if (!title?.startsWith(QUESTIONNAIRE_MARKER)) return null
  try {
    const parsed: unknown = JSON.parse(title.slice(QUESTIONNAIRE_MARKER.length))
    if (!Array.isArray(parsed)) return null
    const questions = parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const { question, header, options, multiSelect } = item as Record<string, unknown>
      if (typeof question !== 'string') return []
      const list = Array.isArray(options)
        ? options.flatMap((option) => {
            if (typeof option === 'string') return [{ label: option }]
            if (!option || typeof option !== 'object') return []
            const { label, description, recommended } = option as Record<string, unknown>
            if (typeof label !== 'string') return []
            return [
              {
                label,
                description: typeof description === 'string' ? description : undefined,
                recommended: recommended === true,
              },
            ]
          })
        : []
      return [
        {
          question,
          header: typeof header === 'string' ? header : undefined,
          options: list,
          multiSelect: multiSelect === true,
        },
      ]
    })
    return questions.length ? questions : null
  } catch {
    return null
  }
}

/** 把作答编码成 select 的 value */
export function encodeAnswers(answers: QuestionAnswer[]): string {
  return JSON.stringify({ piazza: 'answers', answers })
}

/** 解析扩展回传的作答；格式不对返回 null，调用方据此退回逐题询问 */
export function decodeAnswers(value: string | undefined): QuestionAnswer[] | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const { answers } = parsed as Record<string, unknown>
    if (!Array.isArray(answers)) return null
    return answers.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const { index, selected, custom } = item as Record<string, unknown>
      if (typeof index !== 'number') return []
      return [
        {
          index,
          selected: Array.isArray(selected)
            ? selected.filter((v): v is string => typeof v === 'string')
            : [],
          custom: typeof custom === 'string' && custom.length > 0 ? custom : undefined,
        },
      ]
    })
  } catch {
    return null
  }
}
