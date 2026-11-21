import { useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import { Pill } from '@/design/primitives/Pill'
import type { AccountNotice } from '@/rpc/accounts'
import styles from './AccountAuthorization.module.css'

function AuthorizationLink({
  value,
  label = '在浏览器中授权',
  primary = false,
}: {
  value: string
  label?: string
  primary?: boolean
}) {
  const [error, setError] = useState(false)
  if (!/^https?:\/\//i.test(value)) return null
  return (
    <>
      <Pill
        variant={primary ? 'outlined' : 'ghost'}
        icon={<ArrowUpRight size={14} />}
        onClick={() => {
          void openUrl(value).catch(() => setError(true))
        }}
      >
        {label}
      </Pill>
      {error && (
        <p className={styles.linkError} role="alert">
          无法打开浏览器，请手动复制此地址：
          <code className="selectable">{value}</code>
        </p>
      )}
    </>
  )
}

/** 设备码：等宽大字 + 一键复制，抄错一个字符就得从头再走一遍流程 */
function DeviceCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={styles.deviceCode}>
      <code className={`${styles.code} selectable`}>{code}</code>
      <Pill
        icon={copied ? <Check size={13} /> : <Copy size={13} />}
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          })
        }}
      >
        {copied ? '已复制' : '复制'}
      </Pill>
    </div>
  )
}

export function Notice({ notice }: { notice?: AccountNotice }) {
  // 进行中的那句话由卡片头部承载，正文只放需要用户动手的东西
  if (!notice || notice.type === 'progress') return null

  if (notice.type === 'device_code')
    return (
      <div className={styles.notice}>
        <p className={styles.lead}>在厂商页面上输入这个设备码，然后回来等它自动完成：</p>
        <DeviceCode code={notice.userCode} />
        <div className={styles.links}>
          <AuthorizationLink value={notice.verificationUri} label="打开设备授权页面" primary />
        </div>
      </div>
    )

  if (notice.type === 'auth_url')
    return (
      <div className={styles.notice}>
        <p className={styles.lead}>
          {notice.instructions ?? '浏览器里同意后，这一页会自动继续，不用手动刷新。'}
        </p>
        <div className={styles.links}>
          <AuthorizationLink value={notice.url} primary />
        </div>
      </div>
    )

  return (
    <div className={styles.notice}>
      <p className={styles.lead}>{notice.message}</p>
      {notice.type === 'info' && notice.links?.length ? (
        <div className={styles.links}>
          {notice.links.map(({ url, label }) => (
            <AuthorizationLink key={url} value={url} label={label ?? '在浏览器中打开'} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
