import { useEffect, useRef, useState } from 'react'
import { UserRound } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import { Select } from '@/design/primitives/Select'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import { TextField } from '@/design/primitives/TextField'
import type { AccountNotice, AccountPrompt } from '@/rpc/accounts'
import type { AccountFlow } from '../hooks/useProviderAccounts'
import { Notice } from './AuthorizationNotice'
import styles from './AccountAuthorization.module.css'

/** 头部那行小字：说清此刻卡在哪一步，比一句「请稍候」有用 */
const STATUS: Record<AccountNotice['type'], string> = {
  progress: '正在准备授权…',
  auth_url: '等待浏览器完成授权，回到这里会自动继续',
  device_code: '等待你在厂商页面输入设备码',
  info: '还需要你在浏览器里操作一步',
}

/** 头部状态文案：进行中的取厂商给的最新一句话，停下来的说明在等什么 */
function describe(flow: AccountFlow): { text: string; busy: boolean } {
  const { notice, prompt } = flow
  if (notice && notice.type !== 'progress') return { text: STATUS[notice.type], busy: false }
  if (prompt)
    return {
      text:
        prompt.prompt.type === 'select' ? '选一种登录方式，然后继续' : '填入下面的信息，然后继续',
      busy: false,
    }
  return { text: notice?.message ?? '正在准备授权…', busy: true }
}

function PromptInput({
  prompt,
  onAnswer,
}: {
  prompt: AccountPrompt
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
      className={styles.prompt}
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        setSubmitted(true)
        onAnswer(value.trim())
      }}
    >
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
          onChange={setValue}
        />
      )}
      {/* 选中的那一项若有补充说明，放在控件下方而不是塞进选项文字 */}
      {picked?.description && <p className={styles.caption}>{picked.description}</p>}
      <div className={styles.promptActions}>
        <Pill type="submit" variant="primary" disabled={!ready}>
          {submitted ? '已提交' : '继续'}
        </Pill>
      </div>
    </form>
  )
}

export function AccountAuthorization({
  flow,
  onCancel,
  onAnswer,
}: {
  flow: AccountFlow
  onCancel: () => void
  onAnswer: (id: string, value: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const prompt = flow.prompt
  const state = describe(flow)

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <div ref={ref}>
      <Card>
        <header className={styles.head}>
          <span className={styles.badge}>
            <UserRound size={15} />
          </span>
          <div className={styles.headText}>
            <p className={styles.title}>连接 {flow.name}</p>
            <p className={styles.status}>
              {state.busy ? <ShimmerText>{state.text}</ShimmerText> : state.text}
            </p>
          </div>
          <Pill variant="ghost" onClick={onCancel}>
            取消授权
          </Pill>
        </header>

        <div aria-live="polite">
          <Notice notice={flow.notice} />
          {prompt && (
            <PromptInput
              key={prompt.id}
              prompt={prompt.prompt}
              onAnswer={(value) => onAnswer(prompt.id, value)}
            />
          )}
        </div>
      </Card>
    </div>
  )
}
