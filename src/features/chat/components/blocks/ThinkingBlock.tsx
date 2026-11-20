import { useLayoutEffect, useRef } from 'react'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import styles from './ThinkingBlock.module.css'

interface ThinkingBlockProps {
  content: string
  active?: boolean
}

/** 保留最后一个非空行，末尾持续跟随新到的字符。 */
function latestLine(content: string) {
  const trimmed = content.trimEnd()
  const start = trimmed.lastIndexOf('\n') + 1
  return { start, text: trimmed.slice(Math.max(start, trimmed.length - 160)).trimStart() }
}

/**
 * 思考/推理状态行：仅在思考进行中展示单行「正在思考」扫光与最新一行预览，
 * 思考结束后移除，不再保留「已思考」。
 */
export function ThinkingBlock({ content, active = false }: ThinkingBlockProps) {
  const viewport = useRef<HTMLSpanElement>(null)
  const { start, text } = active ? latestLine(content) : { start: 0, text: '' }

  useLayoutEffect(() => {
    const el = viewport.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [text])

  if (!active) return null

  return (
    <div className={styles.block} data-thinking="true">
      <span className={styles.label}>
        <ShimmerText active>正在思考</ShimmerText>
      </span>
      {text && (
        <span ref={viewport} aria-hidden="true" className={styles.preview}>
          <span key={start}>{text}</span>
        </span>
      )}
    </div>
  )
}
