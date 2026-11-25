import { Check, Copy, Download, Palette, RotateCcw } from 'lucide-react'
import { Pill } from '@/design/primitives/Pill'
import { Row } from '@/design/primitives/Row'
import { isDefaultCustomization } from '@/design/themes/applyTheme'
import { readableOn } from '@/design/themes/colorMath'
import { ACCENT_SWATCHES, type ThemeCustomization } from '@/design/themes/presets'
import styles from '../sections/AppearanceSection.module.css'

export function ColorPickerRow({
  title,
  description,
  value,
  fallback,
  onChange,
  onReset,
}: {
  title: string
  description: string
  value: string | null
  fallback: string
  onChange: (hex: string) => void
  onReset: () => void
}) {
  const shown = value ?? fallback
  return (
    <Row
      title={title}
      description={description}
      control={
        <div className={styles.colorControl}>
          <label className={styles.colorChip}>
            <span className={styles.colorDot} style={{ background: shown }} />
            <span>{shown}</span>
            <input
              type="color"
              className={styles.hiddenColorInput}
              value={shown}
              aria-label={title}
              onChange={(e) => onChange(e.target.value)}
            />
          </label>
          {value && <Pill onClick={onReset}>还原</Pill>}
        </div>
      }
    />
  )
}

export function AccentSwatches({
  accent,
  presetAccent,
  onSelect,
}: {
  accent: string | null
  presetAccent: string
  onSelect: (hex: string | null) => void
}) {
  const customActive = accent !== null && !ACCENT_SWATCHES.some((s) => s.value === accent)
  return (
    <div className={styles.swatchRow} role="radiogroup" aria-label="强调色">
      {ACCENT_SWATCHES.map((swatch) => {
        const active = accent === swatch.value
        return (
          <button
            key={swatch.label}
            type="button"
            className={`${styles.swatch} ${swatch.value === null ? styles.swatchAuto : ''}`}
            style={swatch.value ? { background: swatch.value } : undefined}
            data-active={active}
            title={swatch.label}
            aria-label={swatch.label}
            onClick={() => onSelect(swatch.value)}
          >
            {active && swatch.value && <Check size={12} color={readableOn(swatch.value)} />}
          </button>
        )
      })}
      <label
        className={styles.colorInputLabel}
        style={customActive && accent ? { background: accent, borderStyle: 'solid' } : undefined}
        title="自定义强调色"
      >
        <Palette size={12} color={customActive && accent ? readableOn(accent) : undefined} />
        <input
          type="color"
          className={styles.hiddenColorInput}
          value={accent ?? presetAccent}
          aria-label="自定义强调色"
          onChange={(e) => onSelect(e.target.value)}
        />
      </label>
    </div>
  )
}

export function ThemeActionsBar({
  appearance,
  hint,
  onCopy,
  onImport,
  onReset,
}: {
  appearance: ThemeCustomization
  hint: string
  onCopy: () => void
  onImport: () => void
  onReset: () => void
}) {
  return (
    <div className={styles.footerActions}>
      {hint && <span className={styles.statusHint}>{hint}</span>}
      <Pill icon={<Copy size={13} />} onClick={onCopy}>
        复制主题
      </Pill>
      <Pill icon={<Download size={13} />} onClick={onImport}>
        从剪贴板导入
      </Pill>
      {!isDefaultCustomization(appearance) && (
        <Pill icon={<RotateCcw size={13} />} onClick={onReset}>
          恢复默认
        </Pill>
      )}
    </div>
  )
}
