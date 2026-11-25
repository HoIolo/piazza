import { Check } from 'lucide-react'
import {
  THEME_PRESETS,
  type ThemeMode,
  type ThemePreset,
  type ThemePresetId,
} from '@/design/themes/presets'
import styles from '../sections/AppearanceSection.module.css'

function PresetCard({
  preset,
  mode,
  active,
  onSelect,
}: {
  preset: ThemePreset
  mode: ThemeMode
  active: boolean
  onSelect: () => void
}) {
  const p = preset[mode]
  return (
    <button
      type="button"
      className={styles.presetCard}
      data-active={active}
      aria-pressed={active}
      onClick={onSelect}
    >
      <div className={styles.preview} style={{ background: p.surface }}>
        <div className={styles.previewSidebar} style={{ background: p.sidebar }}>
          <span className={styles.previewLine} style={{ background: p.ink, width: '78%' }} />
          <span className={styles.previewLineShort} style={{ background: p.ink }} />
          <span className={styles.previewLineShort} style={{ background: p.ink, width: '48%' }} />
        </div>
        <div className={styles.previewCanvas}>
          <span className={styles.previewLine} style={{ background: p.ink, width: '72%' }} />
          <span className={styles.previewLineShort} style={{ background: p.ink }} />
          <div className={styles.previewFooter}>
            <span className={styles.previewDot} style={{ background: p.diffAdd }} />
            <span className={styles.previewBadge} style={{ background: p.accent }} />
          </div>
        </div>
      </div>
      <div className={styles.presetMeta}>
        <span className={styles.presetName}>{preset.name}</span>
        {active && <Check size={14} className={styles.presetCheck} />}
      </div>
      <span className={styles.presetTagline}>{preset.tagline}</span>
    </button>
  )
}

export function ThemePresetGrid({
  mode,
  selected,
  onSelect,
}: {
  mode: ThemeMode
  selected: ThemePresetId
  onSelect: (id: ThemePresetId) => void
}) {
  return (
    <div className={styles.presetGrid} role="radiogroup" aria-label="个性化主题预设">
      {THEME_PRESETS.map((preset) => (
        <PresetCard
          key={preset.id}
          preset={preset}
          mode={mode}
          active={preset.id === selected}
          onSelect={() => onSelect(preset.id)}
        />
      ))}
    </div>
  )
}
