import { ChevronDown } from 'lucide-react'
import { TextField } from '@/design/primitives/TextField'
import { thinkingLabel } from '@/shared/utils/format'
import type { ThinkingLevel } from '@/rpc/types'
import {
  THINKING_LEVELS,
  availableLevels,
  matchThinkingPreset,
  supportsOff,
  type LevelMap,
} from '../thinkingPresets'
import { EXTENDED_LEVELS, parseRaw, rawText, stateOf, toggleLevel } from '../levelMapText'
import styles from './ThinkingLevelField.module.css'

export interface ThinkingLevelFieldProps {
  modelId: string
  reasoning: boolean
  map: LevelMap | undefined
  /** 用户手动改过映射后即为 true，不再跟随预设 */
  customized: boolean
  onMapChange: (map: LevelMap | undefined) => void
  onCustomize: () => void
  onReset: () => void
}

function LevelPill({
  level,
  map,
  onToggle,
}: {
  level: ThinkingLevel
  map: LevelMap | undefined
  onToggle: () => void
}) {
  const state = stateOf(level, map)
  const mapped = map?.[level]
  return (
    <button
      type="button"
      className={styles.pill}
      data-state={state}
      aria-pressed={state !== 'off'}
      aria-label={`${thinkingLabel(level)}${state === 'off' ? '（不支持）' : ''}`}
      title={typeof mapped === 'string' ? `发送 ${mapped}` : undefined}
      onClick={onToggle}
    >
      <span className={styles.pillName}>{thinkingLabel(level)}</span>
      {typeof mapped === 'string' && <span className={styles.pillValue}>{mapped}</span>}
    </button>
  )
}

/** 可用档位一览：实心表示支持，虚线表示不支持，扩展档额外描边 */
function LevelSummary({ map }: { map: LevelMap | undefined }) {
  const levels = availableLevels(map)
  return (
    <div className={styles.summary} aria-label="可用档位">
      {THINKING_LEVELS.filter((l) => l !== 'off').map((level) => (
        <span
          key={level}
          className={styles.chip}
          data-on={levels.includes(level)}
          data-extended={EXTENDED_LEVELS.includes(level)}
        >
          {thinkingLabel(level)}
        </span>
      ))}
      {!supportsOff(map) && <span className={styles.chipOff}>不支持关闭</span>}
    </div>
  )
}

/**
 * 思考强度配置。
 *
 * 默认不打扰用户：模型 ID 能匹配到内置预设时，只显示「已匹配 …」和可用档位；
 * 匹配不到才自动展开高级配置，让用户逐个档位指定发给厂商的值。
 * 这是「配置模型的思考能力」，不是「选本次用哪一档」——后者在输入框底部。
 */
export function ThinkingLevelField({
  modelId,
  reasoning,
  map,
  customized,
  onMapChange,
  onCustomize,
  onReset,
}: ThinkingLevelFieldProps) {
  const preset = matchThinkingPreset(modelId)

  if (!reasoning) {
    return (
      <div className={styles.field}>
        <span className={styles.label}>思考强度</span>
        <p className={styles.note}>开启「支持推理」后可配置思考强度档位</p>
      </div>
    )
  }

  const advanced = customized || (!preset && modelId.trim().length > 0)

  return (
    <div className={styles.field}>
      <div className={styles.header}>
        <span className={styles.label}>思考强度</span>
        {preset && !customized && <span className={styles.badge}>已匹配 {preset.label}</span>}
        {customized && (
          <span className={styles.badge} data-custom="true">
            自定义
          </span>
        )}
      </div>

      <LevelSummary map={map} />

      <button
        type="button"
        className={styles.toggle}
        aria-expanded={advanced}
        onClick={customized ? onReset : onCustomize}
      >
        <ChevronDown size={13} className={styles.chevron} data-open={advanced} />
        {customized ? '恢复预设' : '高级：逐个档位指定'}
      </button>

      {advanced && (
        <div className={styles.advanced}>
          <p className={styles.hint}>
            点击档位切换是否支持；有值的档位会把该字符串发给厂商（如 <code>high</code>）。
            留空的扩展档视为不支持。
          </p>
          <div className={styles.pills}>
            {THINKING_LEVELS.map((level) => (
              <LevelPill
                key={level}
                level={level}
                map={map}
                onToggle={() => onMapChange(toggleLevel(level, map))}
              />
            ))}
          </div>
          <div className={styles.rawRow}>
            <span className={styles.rawLabel}>映射值</span>
            <TextField
              value={rawText(map)}
              monospace
              placeholder="留空表示不覆盖"
              ariaLabel="思考强度映射"
              onChange={(text) => onMapChange(parseRaw(text))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
