import styles from './Segmented.module.css'

export interface SegmentedOption {
  value: string
  label: string
}

export interface SegmentedProps {
  value: string
  options: SegmentedOption[]
  onChange: (value: string) => void
  ariaLabel?: string
}

/** 分段控件，对应截图中的「底部 / 右侧」 */
export function Segmented({ value, options, onChange, ariaLabel }: SegmentedProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={styles.segment}
          data-active={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
