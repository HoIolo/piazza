import { isValidElement, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Copy, WrapText } from 'lucide-react'
import { tokenizeCode, type SyntaxTokenType } from './highlight'
import styles from './CodeBlock.module.css'

export interface CodeBlockProps {
  /** 围栏上标的语言；没标就不显示语言名，只留操作按钮 */
  language: string
  children: ReactNode
}

/** 「已复制」的反馈停留多久 */
const COPIED_MS = 1600

const TOKEN_CLASS: Record<SyntaxTokenType, string> = {
  comment: styles.tokComment,
  keyword: styles.tokKeyword,
  literal: styles.tokLiteral,
  string: styles.tokString,
  variable: styles.tokVariable,
  attribute: styles.tokAttribute,
  name: styles.tokName,
}

function extractRawCode(children: ReactNode): { text: string; className?: string } | null {
  if (!isValidElement<{ children?: ReactNode; className?: string }>(children)) {
    return typeof children === 'string' ? { text: children } : null
  }
  const inner = children.props.children
  if (typeof inner === 'string') {
    return { text: inner, className: children.props.className }
  }
  return null
}

/**
 * 围栏代码块：1:1 对齐 Codex 的 CodeSurface（语言名 + 换行切换 + 复制按钮 + 语义高亮）。
 */
export function CodeBlock({ language, children }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const [wrapped, setWrapped] = useState(false)

  const extracted = extractRawCode(children)
  const tokens = useMemo(() => {
    if (!extracted || !language) return null
    return tokenizeCode(extracted.text, language)
  }, [extracted, language])

  const copy = () => {
    const text = preRef.current?.textContent ?? ''
    void navigator.clipboard.writeText(text.replace(/\n$/, '')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_MS)
    })
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        {language ? <span className={styles.language}>{language}</span> : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setWrapped((prev) => !prev)}
            data-active={wrapped}
            aria-pressed={wrapped}
            aria-label={wrapped ? '关闭自动换行' : '开启自动换行'}
            title={wrapped ? '关闭自动换行' : '开启自动换行'}
          >
            <WrapText size={14} />
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={copy}
            aria-label={copied ? '已复制' : '复制代码'}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>
      <pre ref={preRef} className={styles.pre} data-wrap={wrapped}>
        {tokens && extracted ? (
          <code className={extracted.className}>
            {tokens.map((tok, i) =>
              tok.type ? (
                <span key={i} className={TOKEN_CLASS[tok.type]}>
                  {tok.text}
                </span>
              ) : (
                tok.text
              ),
            )}
          </code>
        ) : (
          children
        )}
      </pre>
    </div>
  )
}
