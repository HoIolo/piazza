import styles from './TextField.module.css'

export interface TextFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** 密码型字段，失焦后以圆点展示 */
  secret?: boolean
  type?: 'text' | 'number'
  ariaLabel?: string
  monospace?: boolean
}

export function TextField({
  value,
  onChange,
  placeholder,
  secret = false,
  type = 'text',
  ariaLabel,
  monospace = false,
}: TextFieldProps) {
  return (
    <input
      className={styles.input}
      data-mono={monospace}
      type={secret ? 'password' : type}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
