import type { CSSProperties } from 'react'
import type { SessionState, ThinkingLevel } from '@/rpc/types'
import { useAppStore } from '@/store/app.store'
import { CONTEXT_WINDOW_CHOICES, modelContextKey } from '@/store/chat/contextWindow'
import { LevelSlider } from './LevelSlider'
import styles from './ModelPicker.module.css'

export function ModelControls({
  session,
  levels,
  loading,
  onChange,
  onContextChange,
}: {
  session: SessionState | null
  levels: ThinkingLevel[]
  loading: boolean
  onChange: (level: ThinkingLevel) => void
  onContextChange: (contextWindow: number) => void
}) {
  const modelContextWindows = useAppStore((s) => s.modelContextWindows)
  if (!session) return null
  const currentModel = session.model
  const savedForModel = currentModel
    ? modelContextWindows[modelContextKey(currentModel.provider, currentModel.id)]
    : undefined
  const currentContext = savedForModel ?? currentModel?.contextWindow
  const activeIndex = CONTEXT_WINDOW_CHOICES.findIndex((opt) => opt.value === currentContext)

  return (
    <>
      {levels.length > 1 ? (
        <LevelSlider levels={levels} current={session.thinkingLevel} onChange={onChange} />
      ) : (
        !loading && currentModel && <div className={styles.note}>该模型不支持调节推理强度</div>
      )}

      <div className={styles.contextSection}>
        <div className={styles.contextHeader}>
          <span className={styles.contextTitle}>上下文</span>
          <span className={styles.contextHint}>80% 自动压缩</span>
        </div>
        <div
          className={styles.contextPills}
          role="radiogroup"
          aria-label="上下文窗口"
          style={{ '--active-index': Math.max(0, activeIndex) } as CSSProperties}
        >
          <span
            className={styles.contextThumb}
            data-visible={activeIndex >= 0}
            aria-hidden="true"
          />
          {CONTEXT_WINDOW_CHOICES.map((opt) => {
            const active = currentContext === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                data-active={active}
                className={styles.contextPill}
                onClick={() => onContextChange(opt.value)}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
