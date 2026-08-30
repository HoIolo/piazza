import { Bug, Hammer, RefreshCcwDot, Telescope } from 'lucide-react'
import { BrandMark } from '@/shared/components/BrandMark'
import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  projectName: string
  onPickSuggestion: (prompt: string) => void
}

/** 建议卡片。文案与图标顺序对齐截图 */
const SUGGESTIONS = [
  { icon: Telescope, label: '探索并理解代码', accent: 'explore', prompt: '帮我探索并理解这个代码库的结构' },
  { icon: Hammer, label: '构建新功能、应用或工具', accent: 'build', prompt: '我想构建一个新功能' },
  { icon: RefreshCcwDot, label: '审查代码并提出修改建议', accent: 'review', prompt: '审查当前改动并提出修改建议' },
  { icon: Bug, label: '修复问题和失败', accent: 'fix', prompt: '帮我定位并修复当前的问题' },
] as const

/** 无会话时的主区内容，对应截图 2 / 3 */
export function EmptyState({ projectName, onPickSuggestion }: EmptyStateProps) {
  return (
    <div className={styles.wrapper}>
      <BrandMark className={styles.mark} />
      <h1 className={styles.title}>
        要在 <span className={styles.project}>{projectName}</span> 内开发什么？
      </h1>
      <div className={styles.cards}>
        {SUGGESTIONS.map(({ icon: Icon, label, accent, prompt }) => (
          <button
            key={label}
            type="button"
            className={styles.card}
            onClick={() => onPickSuggestion(prompt)}
          >
            <Icon size={20} className={styles.cardIcon} data-accent={accent} />
            <span className={styles.cardLabel}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
