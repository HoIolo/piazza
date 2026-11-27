import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { KeyRound, UserRound, X } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { Pill } from '@/design/primitives/Pill'
import { ShimmerText } from '@/design/primitives/ShimmerText'
import type { AccountNotice } from '@/rpc/accounts'
import type { AccountFlow } from '../hooks/useProviderAccounts'
import { AccountAuthPrompt } from './AccountAuthPrompt'
import { Notice } from './AuthorizationNotice'
import styles from './AccountAuthorization.module.css'

/** 头部状态提示：说清当前等待用户的具体一步 */
const STATUS: Record<AccountNotice['type'], string> = {
  progress: '正在准备授权…',
  auth_url: '等待浏览器完成授权，回到这里会自动继续',
  device_code: '等待你在厂商页面输入设备码',
  info: '还需要你在浏览器里操作一步',
}

function describe(flow: AccountFlow): { text: string; busy: boolean } {
  const { notice, prompt, method } = flow
  if (notice && notice.type !== 'progress') return { text: STATUS[notice.type], busy: false }
  if (prompt) {
    return {
      text: prompt.prompt.type === 'select' ? '选一种登录方式，然后继续' : '填入下面的信息，然后继续',
      busy: false,
    }
  }
  return {
    text: notice?.message ?? (method === 'api_key' ? '正在准备配置…' : '正在准备授权…'),
    busy: true,
  }
}

function DialogBody({
  active,
  titleId,
  onCancel,
  onAnswer,
}: {
  active: AccountFlow
  titleId: string
  onCancel: () => void
  onAnswer: (id: string, value: string) => void
}) {
  const state = describe(active)
  const isApiKey = active.method === 'api_key'
  const heading = isApiKey ? `配置 ${active.name} API Key` : `连接 ${active.name}`
  const prompt = active.prompt
  return (
    <>
      <header className={styles.head}>
        <span className={styles.badge}>
          {isApiKey ? <KeyRound size={15} /> : <UserRound size={15} />}
        </span>
        <div className={styles.headText}>
          <h2 id={titleId} className={styles.title}>
            {heading}
          </h2>
          <p className={styles.status}>
            {state.busy ? <ShimmerText>{state.text}</ShimmerText> : state.text}
          </p>
        </div>
        <IconButton ariaLabel="取消授权" onClick={onCancel}>
          <X size={15} />
        </IconButton>
      </header>
      <div className={styles.body} aria-live="polite">
        <Notice notice={active.notice} />
        {prompt ? (
          <AccountAuthPrompt
            key={prompt.id}
            prompt={prompt.prompt}
            confirmLabel={isApiKey ? '保存' : '继续'}
            onCancel={onCancel}
            onAnswer={(value) => onAnswer(prompt.id, value)}
          />
        ) : (
          <footer className={styles.footer}>
            <Pill onClick={onCancel}>取消授权</Pill>
          </footer>
        )}
      </div>
    </>
  )
}

/** 厂商账号登录 / API Key 配置居中弹窗：保持挂载 + data-open 平滑过渡，不再内联撑开列表 */
export function AccountAuthorization({
  flow,
  onCancel,
  onAnswer,
}: {
  flow: AccountFlow | null
  onCancel: () => void
  onAnswer: (id: string, value: string) => void
}) {
  const titleId = useId()
  const [snapshot, setSnapshot] = useState<AccountFlow | null>(flow)
  if (flow && flow !== snapshot) setSnapshot(flow)

  const open = Boolean(flow)
  const active = flow ?? snapshot

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.stopPropagation()
      onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  return createPortal(
    <div
      className={styles.overlay}
      data-open={open}
      aria-hidden={!open}
      onMouseDown={(e) => {
        if (open && e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className={styles.dialog}
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {active && (
          <DialogBody active={active} titleId={titleId} onCancel={onCancel} onAnswer={onAnswer} />
        )}
      </div>
    </div>,
    document.body,
  )
}
