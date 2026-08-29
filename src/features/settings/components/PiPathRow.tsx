import { useEffect, useState } from 'react'
import { CircleCheck, CircleX } from 'lucide-react'
import { Row } from '@/design/primitives/Row'
import { TextField } from '@/design/primitives/TextField'
import { locatePi, type PiLauncher } from '@/shared/api/pi'
import styles from './PiPathRow.module.css'

/**
 * 显示并覆盖 pi 的可执行文件位置。
 *
 * 这一项不是可有可无的装饰：macOS 双击启动的 .app 不继承 shell PATH，
 * 自动探测在少数环境下会失败，那时用户只能靠这里手动指定。
 */
export function PiPathRow() {
  const [launcher, setLauncher] = useState<PiLauncher | null>(null)
  const [override, setOverride] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    locatePi()
      .then(setLauncher)
      .catch(() => setLauncher(null))
      .finally(() => setChecking(false))
  }, [])

  const applyOverride = (value: string) => {
    setOverride(value)
    setChecking(true)
    locatePi(value, true)
      .then(setLauncher)
      .catch(() => setLauncher(null))
      .finally(() => setChecking(false))
  }

  const resolved = launcher
    ? [launcher.program, ...launcher.prefixArgs].join(' ')
    : '未找到 pi'

  return (
    <Row
      title="pi 可执行文件"
      description={
        <span className={styles.status}>
          {checking ? null : launcher ? (
            <CircleCheck size={13} className={styles.ok} />
          ) : (
            <CircleX size={13} className={styles.fail} />
          )}
          <code className={styles.path}>{checking ? '检测中…' : resolved}</code>
          {launcher && <span className={styles.source}>（来源：{launcher.source}）</span>}
        </span>
      }
      stacked
      control={
        <TextField
          value={override}
          monospace
          placeholder="留空则自动探测；也可手动填入 pi 的绝对路径"
          onChange={applyOverride}
        />
      }
    />
  )
}
