export function diffLines(diff: string) {
  let inHunk = false
  return diff.split('\n').map((text) => {
    if (!text || text.startsWith('diff ')) inHunk = false
    if (text.startsWith('@@')) {
      inHunk = true
      return { text, kind: 'hunk' }
    }
    if (inHunk || /^[+-]\s*\d+ /.test(text)) {
      if (text.startsWith('+')) return { text, kind: 'add' }
      if (text.startsWith('-')) return { text, kind: 'del' }
    }
    if (/^(diff |index |--- |\+\+\+ )/.test(text)) return { text, kind: 'meta' }
    return { text, kind: 'text' }
  })
}

export function countDiffLines(diff: string) {
  let additions = 0
  let deletions = 0
  for (const { kind } of diffLines(diff)) {
    if (kind === 'add') additions++
    if (kind === 'del') deletions++
  }
  return { additions, deletions }
}
