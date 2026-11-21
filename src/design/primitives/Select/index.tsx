import { ChevronDown } from 'lucide-react'
import { MenuItem } from '../MenuList'
import { Popover } from '../Popover'
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
  /** 尚未选择时的灰字提示；不传则回退到 value 本身 */
  placeholder?: string
  /** 撑满所在容器（表单里用），默认按内容宽度 */
  fullWidth?: boolean
  /** 浮层与触发器的对齐边：设置行右侧控件默认右对齐，表单内可设为 start */
  align?: 'start' | 'end'
}

/**
 * 统一自定义下拉选择：使用应用原生 Popover + MenuItem 渲染，
 * 告别系统原生 <select> 的割裂灰框与蓝条，支持深浅主题、毛玻璃与键盘选择。
 */
export function Select({
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  placeholder,
  fullWidth = false,
  align = 'end',
}: SelectProps) {
  const current = options.find((o) => o.value === value)
  const currentIndex = options.findIndex((o) => o.value === value)

  const stepOption = (delta: number) => {
    if (options.length === 0) return
    const next = (currentIndex + delta + options.length) % options.length
    const target = options[next]
    if (target) onChange(target.value)
  }

  return (
    <Popover
      side="bottom"
      align={align}
      maxHeight={320}
      panelClassName={styles.panel}
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          className={styles.trigger}
          disabled={disabled}
          data-open={open}
          data-full={fullWidth}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => {
            if (!disabled) toggle()
          }}
          onKeyDown={(e) => {
            if (disabled) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (open) stepOption(1)
              else toggle()
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (open) stepOption(-1)
              else toggle()
            }
          }}
        >
          <span className={styles.label} data-empty={!current && !value}>
            {current?.label ?? (value || placeholder || '')}
          </span>
          <ChevronDown size={14} className={styles.chevron} data-open={open} aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div className={styles.list} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <MenuItem
              key={option.value}
              selected={option.value === value}
              onClick={() => {
                onChange(option.value)
                close()
              }}
            >
              {option.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  )
}
