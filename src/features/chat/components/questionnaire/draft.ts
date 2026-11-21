/** 一题的作答草稿：单选记 label，多选记一组，自填记原文 */
export interface Draft {
  selected: string[]
  custom: string
}

export const EMPTY_DRAFT: Draft = { selected: [], custom: '' }

/** 该题是否已作答：选了选项或写了自填 */
export function isAnswered(draft: Draft | undefined): boolean {
  const item = draft ?? EMPTY_DRAFT
  return item.custom.trim().length > 0 || item.selected.length > 0
}

/** 点选项后的草稿：多选切换，单选替换并清掉自填 */
export function toggleDraft(draft: Draft, label: string, multi: boolean): Draft {
  if (!multi) return { selected: [label], custom: '' }
  return {
    selected: draft.selected.includes(label)
      ? draft.selected.filter((item) => item !== label)
      : [...draft.selected, label],
    custom: '',
  }
}

/** 写自填后的草稿：一写字就取消已选项，避免两者同时成立 */
export function withCustom(draft: Draft, value: string): Draft {
  return { selected: value ? [] : draft.selected, custom: value }
}
