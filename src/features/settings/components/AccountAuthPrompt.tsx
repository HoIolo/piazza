import { useState } from 'react'
import { Pill } from '@/design/primitives/Pill'
import { Select } from '@/design/primitives/Select'
import { TextField } from '@/design/primitives/TextField'
import type { AccountPrompt } from '@/rpc/accounts'
import styles from './AccountAuthorization.module.css'

export function AccountAuthPrompt({
  prompt,
  confirmLabel,
  onCancel,
  onAnswer,
}: {
  prompt: AccountPrompt
  confirmLabel: string
  onCancel: () => void
  onAnswer: (value: string) => void
}) {
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const options =
    prompt.type === 'select' ? prompt.options.map(({ id, label }) => ({ value: id, label })) : []
  const picked = prompt.type === 'select' ? prompt.options.find((o) => o.id === value) : undefined
  const ready = value.trim().length > 0 && !submitted

  return (
    <form
      className={styles.promptForm}
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        setSubmitted(true)
        onAnswer(value.trim())
      }}
    >
      <div className={styles.prompt}>
        <p className={styles.promptLabel}>{prompt.message}</p>
        {prompt.type === 'select' ? (
          <Select
            value={value}
            options={options}
            onChange={setValue}
            ariaLabel={prompt.message}
            placeholder="请选择一项"
            fullWidth
            align="start"
            disabled={submitted}
          />
        ) : (
          <TextField
            secret={prompt.type === 'secret' || prompt.type === 'manual_code'}
            value={value}
            ariaLabel={prompt.message}
            placeholder={prompt.placeholder}
            disabled={submitted}
            autoFocus
            onChange={setValue}
          />
        )}
        {picked?.description && <p className={styles.caption}>{picked.description}</p>}
      </div>
      <footer className={styles.footer}>
        <Pill variant="ghost" onClick={onCancel}>
          取消
        </Pill>
        <Pill type="submit" variant="primary" disabled={!ready}>
          {submitted ? '已提交' : confirmLabel}
        </Pill>
      </footer>
    </form>
  )
}
