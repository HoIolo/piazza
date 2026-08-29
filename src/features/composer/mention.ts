/**
 * 解析光标前是否正处在一个 @ 提及中。
 *
 * 只认「@ 紧跟在行首或空白之后」的情形，邮箱、装饰器（@Component）
 * 这类文本里的 @ 不该弹出面板。
 */
export interface MentionContext {
  /** @ 所在下标 */
  start: number
  /** @ 与光标之间的关键词 */
  query: string
}

export function detectMention(text: string, caret: number): MentionContext | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null

  // @ 之前必须是行首或空白
  const prev = at > 0 ? before[at - 1] : ' '
  if (!/\s/.test(prev)) return null

  const query = before.slice(at + 1)
  // 关键词内不允许空白：一旦空格，说明这段提及已经写完了
  if (/\s/.test(query)) return null

  return { start: at, query }
}

/** 用选中项替换掉 @关键词 这一段，并在末尾补一个空格 */
export function replaceMention(
  text: string,
  context: MentionContext,
  caret: number,
  insert: string,
): { text: string; caret: number } {
  const head = text.slice(0, context.start)
  const tail = text.slice(caret)
  const next = `${head}${insert} ${tail}`
  return { text: next, caret: head.length + insert.length + 1 }
}
