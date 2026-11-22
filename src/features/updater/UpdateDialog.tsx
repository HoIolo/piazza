import { Dialog } from '@/design/primitives/Dialog'
import { Markdown } from '@/shared/components/Markdown'
import { useAppStore } from '@/store/app.store'
import styles from './UpdateDialog.module.css'

/** 一行就说完的相位，不必拼装 */
const PLAIN: Record<string, string> = {
  checking: '正在检查…',
  uptodate: '已是最新版本。',
  downloading: '正在下载',
  installing: '正在安装…',
  ready: '安装完成，重启后生效。',
}

function ProgressBar({ progress }: { progress: number | null }) {
  const percent = progress === null ? null : Math.round(progress * 100)
  return (
    <div className={styles.progress} role="progressbar" aria-label="下载进度">
      <div
        className={styles.bar}
        data-indeterminate={percent === null}
        style={percent === null ? undefined : { width: `${percent}%` }}
      />
    </div>
  )
}

function StatusLine({ phase, progress }: { phase: string; progress: number | null }) {
  if (phase !== 'downloading') return <p className={styles.hint}>{PLAIN[phase]}</p>
  const percent = progress === null ? null : Math.round(progress * 100)
  return <p className={styles.hint}>{percent === null ? '正在下载…' : `正在下载 ${percent}%`}</p>
}

/** 「有新版本」这一支：版本号 + 发布说明 + 进度 */
function AvailableBody() {
  const phase = useAppStore((s) => s.phase)
  const info = useAppStore((s) => s.info)
  const progress = useAppStore((s) => s.progress)
  const busy = phase === 'downloading' || phase === 'installing'
  return (
    <>
      <p className={styles.version}>新版本 {info?.version ?? ''}</p>
      {info?.notes ? (
        <div className={styles.notes}>
          <Markdown>{info.notes}</Markdown>
        </div>
      ) : null}
      {busy ? <ProgressBar progress={progress} /> : null}
      <StatusLine phase={phase} progress={progress} />
    </>
  )
}

function Body() {
  const phase = useAppStore((s) => s.phase)
  const error = useAppStore((s) => s.error)

  if (phase === 'error') return <p className={styles.error}>{error ?? '检查更新失败'}</p>
  if (PLAIN[phase] && !PLAIN[phase].startsWith('正在下载')) {
    return <p className={styles.hint}>{PLAIN[phase]}</p>
  }
  return <AvailableBody />
}

function titleFor(phase: string): string {
  if (phase === 'uptodate') return '已是最新版本'
  if (phase === 'error') return '检查更新失败'
  if (phase === 'checking') return '检查更新'
  if (phase === 'ready') return '更新已就绪'
  return '发现新版本'
}

function confirmLabelFor(phase: string): string {
  if (phase === 'available') return '下载并安装'
  if (phase === 'ready') return '立即重启'
  if (phase === 'uptodate' || phase === 'error') return '好'
  return '关闭'
}

/**
 * 自动更新弹窗。相位全在 updater 切片里，这里只负责把状态翻成一段话。
 *
 * 「稍后」不是放弃——下载完关掉也能在下次启动时装，
 * 但没下载就关掉的话，这次运行里不再自动弹（见 closeDialog 的 dismissed）。
 */
export function UpdateDialog() {
  const phase = useAppStore((s) => s.phase)
  const open = useAppStore((s) => s.dialogOpen)
  const download = useAppStore((s) => s.download)
  const restart = useAppStore((s) => s.restart)
  const close = useAppStore((s) => s.closeDialog)

  if (!open) return null

  const busy = phase === 'downloading' || phase === 'installing'
  const confirm = () => {
    if (phase === 'available') return void download()
    if (phase === 'ready') return void restart()
    close()
  }

  return (
    <Dialog
      title={titleFor(phase)}
      onClose={close}
      onConfirm={confirm}
      confirmLabel={confirmLabelFor(phase)}
      busy={busy}
    >
      <Body />
    </Dialog>
  )
}
