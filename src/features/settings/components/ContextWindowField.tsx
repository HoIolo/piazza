import { Field } from '@/design/primitives/Field'
import { Segmented } from '@/design/primitives/Segmented'
import { TextField } from '@/design/primitives/TextField'
import { formatTokens } from '@/shared/utils/format'
import { CONTEXT_WINDOW_PRESETS, DEFAULT_CONTEXT_WINDOW } from '../constants'
import { CUSTOM_CONTEXT } from '../hooks/useModelDraft'
import { numberText, parseNumber } from '../numberField'

const OPTIONS = [
  ...CONTEXT_WINDOW_PRESETS.map((n) => ({ value: String(n), label: formatTokens(n) })),
  { value: CUSTOM_CONTEXT, label: '自定义' },
]

export interface ContextWindowFieldProps {
  choice: string
  value: number | undefined
  onPick: (choice: string) => void
  onCustom: (value: number | undefined) => void
}

/** 上下文窗口：三个常用档位一键选，其余数值走「自定义」原样保留 */
export function ContextWindowField({ choice, value, onPick, onCustom }: ContextWindowFieldProps) {
  return (
    <Field label="上下文窗口">
      <Segmented value={choice} options={OPTIONS} ariaLabel="上下文窗口" onChange={onPick} />
      {choice === CUSTOM_CONTEXT && (
        <TextField
          value={numberText(value)}
          type="number"
          placeholder={`留空则按 ${formatTokens(DEFAULT_CONTEXT_WINDOW)} 算`}
          ariaLabel="自定义上下文窗口"
          onChange={(v) => onCustom(parseNumber(v))}
        />
      )}
    </Field>
  )
}
