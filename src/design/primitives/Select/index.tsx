import { ChevronDown } from 'lucide-react'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
}

/**
 * 下拉选择。外观是自绘的胶囊按钮，但底层用原生 select 承载交互——
 * 这样键盘导航、读屏、系统级选项面板都能直接复用，无需自己实现。
 */
export function Select({ value, options, onChange, disabled = false, ariaLabel }: SelectProps) {
  const current = options.find((o) => o.value === value)

  return (
    <div className={styles.wrapper} data-disabled={disabled}>
      <span className={styles.label}>{current?.label ?? value}</span>
      <ChevronDown size={14} className={styles.chevron} aria-hidden />
      <select
        className={styles.native}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
