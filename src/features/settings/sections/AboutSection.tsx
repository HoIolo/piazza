import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { Toggle } from '@/design/primitives/Toggle'
import { useAppStore } from '@/store/app.store'
import styles from './AboutSection.module.css'

const PHASE_TEXT: Record<string, string> = {
  checking: '正在检查…',
  uptodate: '已是最新版本',
  error: '检查失败，稍后再试',
  available: '有新版本可用',
  downloading: '正在下载…',
  installing: '正在安装…',
  ready: '已下载，重启后生效',
}

/** 「关于」：版本号与更新。自动检查的开关也存在这里，用户找得到关掉它的地方 */
export function AboutSection() {
  const [version, setVersion] = useState('')
  const phase = useAppStore((s) => s.phase)
  const autoCheck = useAppStore((s) => s.autoCheck)
  const setAutoCheck = useAppStore((s) => s.setAutoCheck)
  const check = useAppStore((s) => s.check)
  const openDialog = useAppStore((s) => s.openDialog)

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => undefined)
  }, [])

  const busy = phase === 'checking' || phase === 'downloading' || phase === 'installing'
  const status =
    phase === 'available' || phase === 'ready'
      ? PHASE_TEXT[phase]
      : (PHASE_TEXT[phase] ?? '手动检查一次是否有新版本')

  return (
    <Card title="关于">
      <Row title="版本" description={version ? `Piazza ${version}` : 'Piazza'} />
      <Row
        title="自动检查更新"
        description="每 12 小时最多一次，只有发现新版本才会提示"
        control={<Toggle checked={autoCheck} onChange={setAutoCheck} ariaLabel="自动检查更新" />}
      />
      <Row
        title="检查更新"
        description={status}
        control={
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => {
              // 已有结果就先把弹窗叫出来，别让用户以为点了没反应
              if (phase === 'available' || phase === 'ready') return openDialog()
              void check()
            }}
          >
            {phase === 'available' || phase === 'ready' ? '查看' : '检查'}
          </button>
        }
      />
    </Card>
  )
}
