/**
 * ask_user_question — Claude Code / Codex 风格的提问工具。
 *
 * 两种呈现：
 * - GUI（Piazza）：把整份问卷编码进一次 `ctx.ui.select` 的 title，客户端认得
 *   `piazza:questions:` 前缀就渲染成 Codex 那种多题面板（翻页、多选、自填）；
 *   认不出标记的客户端只会看到一串普通选项，此时回退成逐题询问。
 * - TUI：保持原来的自绘分页界面（终端里唯一能表达多题的方式）。
 *
 * 为什么不新增 RPC 方法：pi 的扩展 UI 子协议只有 select/confirm/input/editor
 * 四种，扩方法要改 SDK。复用 select 的 title 承载结构化数据，既不碰 SDK，
 * 也能让不认识标记的宿主优雅降级。
 */

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

// ---------- 与 GUI 共享的编码格式（须与 src/shared/utils/questionnaire.ts 一致） ----------

const QUESTIONNAIRE_MARKER = 'piazza:questions:'

interface QuestionOption {
  label: string
  description?: string
  /** 推荐项：界面在标签右侧标「推荐」 */
  recommended?: boolean
}

interface Question {
  question: string
  header?: string
  options: QuestionOption[]
  multiSelect?: boolean
}

interface QuestionAnswer {
  index: number
  selected: string[]
  custom?: string
}

function encodeQuestions(questions: Question[]): string {
  return QUESTIONNAIRE_MARKER + JSON.stringify(questions)
}

function decodeAnswers(value: string | undefined): QuestionAnswer[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as { answers?: QuestionAnswer[] }
    return Array.isArray(parsed.answers) ? parsed.answers : null
  } catch {
    return null
  }
}

/** 把作答汇总成模型能读的一段话 */
function summarize(questions: Question[], answers: QuestionAnswer[]): string {
  const lines = answers.map((answer) => {
    const question = questions[answer.index]?.question ?? `问题 ${answer.index + 1}`
    const text = answer.custom
      ? `"${answer.custom}"（自定义）`
      : answer.selected.join('、') || '（未作答）'
    return `${answer.index + 1}. ${question} → ${text}`
  })
  return `用户的选择：\n${lines.join('\n')}`
}

// ---------- 逐题回退：宿主不认结构化标记时用 ----------

async function askOneByOne(
  questions: Question[],
  ctx: ExtensionContext,
): Promise<QuestionAnswer[] | null> {
  const answers: QuestionAnswer[] = []
  for (let i = 0; i < questions.length; i += 1) {
    const question = questions[i]
    const labels = question.options.map((option) => option.label)
    const title = question.header ? `${question.header}\n${question.question}` : question.question

    if (question.multiSelect) {
      const raw = await ctx.ui.input(`${title}\n（输入选项序号，用逗号分隔）`, '')
      if (raw === undefined) return null
      const picked = [...new Set([...raw.matchAll(/\d+/g)].map((m) => Number(m[0])))]
        .filter((n) => n >= 1 && n <= labels.length)
        .map((n) => labels[n - 1])
      answers.push({ index: i, selected: picked })
      continue
    }

    const choice = await ctx.ui.select(title, [...labels, '以上都不是，我来说明'])
    if (choice === undefined) return null
    if (choice === '以上都不是，我来说明') {
      const custom = await ctx.ui.input(title, '')
      if (custom === undefined) return null
      answers.push({ index: i, selected: [], custom: custom.trim() || undefined })
      continue
    }
    answers.push({ index: i, selected: [choice] })
  }
  return answers
}

// ---------- 工具注册 ----------

const OptionSchema = Type.Object({
  label: Type.String({ description: 'Short label for the option' }),
  description: Type.Optional(
    Type.String({ description: 'Optional description shown below the label' }),
  ),
  recommended: Type.Optional(Type.Boolean({ description: 'Mark this option as recommended' })),
})

const QuestionSchema = Type.Object({
  question: Type.String({ description: 'The question to ask the user' }),
  header: Type.Optional(Type.String({ description: 'Optional title shown above the question' })),
  options: Type.Array(OptionSchema, { description: 'Options the user can pick from' }),
  multiSelect: Type.Optional(
    Type.Boolean({ description: 'Allow selecting multiple options (default false)' }),
  ),
})

const ParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, {
    description:
      'The questions to ask. Use 1-4 questions, one per decision you need from the user.',
  }),
})

function emptyResult() {
  return { answers: [], cancelled: true }
}

export default function askUserQuestion(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'ask_user_question',
    label: 'Ask User Question',
    description:
      'Ask the user one or more multiple-choice questions with options, and wait for their answers. ' +
      'Use when you need a decision, preference, or confirmation that cannot be safely guessed. ' +
      'Each question shows numbered options; the user picks one (or several with multiSelect) or types a custom answer. ' +
      'Ask at most one batch of questions per turn, and only when you truly cannot proceed without input.',
    promptSnippet: 'Ask the user a question with numbered options and wait for their answer',
    parameters: ParamsSchema,
    executionMode: 'sequential',

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const questions = params.questions as Question[]
      if (questions.length === 0) {
        return {
          content: [{ type: 'text', text: 'Error: questions array is empty' }],
          details: emptyResult(),
        }
      }
      if (!ctx.hasUI) {
        return {
          content: [
            {
              type: 'text',
              text:
                'Error: cannot ask the user in this mode (no UI available). ' +
                'Make a reasonable assumption, state it explicitly, and continue.',
            },
          ],
          details: emptyResult(),
        }
      }

      // GUI 走一次 select 交整份问卷；宿主不认标记时会回传一个普通选项字符串
      const raw = await ctx.ui.select(encodeQuestions(questions), [])
      const answers = decodeAnswers(raw) ?? (await askOneByOne(questions, ctx))
      if (!answers) {
        return {
          content: [{ type: 'text', text: 'User cancelled the questions.' }],
          details: emptyResult(),
        }
      }

      return {
        content: [{ type: 'text', text: summarize(questions, answers) }],
        details: { answers, cancelled: false },
      }
    },
  })
}
