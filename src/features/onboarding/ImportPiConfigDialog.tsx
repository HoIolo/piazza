import { useEffect, useState } from 'react'
import { Dialog } from '@/design/primitives/Dialog'
import { Toggle } from '@/design/primitives/Toggle'
import { readImportOffer, runImport, skipImport, type ImportOffer } from '@/shared/api/agentImport'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'
import styles from './ImportPiConfigDialog.module.css'

/**
 * 首次启动时询问是否把 pi CLI 的配置搬进应用自有目录。
 *
 * 换了 agent 目录之后两边的凭据、设置、技能各写各的——不搬就会「一打开什么模型
 * 都没有」。搬完要重启一次 pi 进程，否则它还拿着旧目录的模型列表。
 * 浏览器里跑（没有 Tauri）时读取失败，静默不显示。
 */
export function ImportPiConfigDialog() {
  const [offer, setOffer] = useState<ImportOffer | null>(null)
  const [sessions, setSessions] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    readImportOffer()
      .then((value) => {
        setOffer(value)
        // 有历史就默认一起搬：不然侧栏一开局是空的，看不出会话还在
        setSessions((value?.sessionCount ?? 0) > 0)
      })
      .catch(() => setOffer(null))
  }, [])

  if (!offer) return null

  const confirm = () => {
    setBusy(true)
    setError(null)
    runImport(sessions)
      .then(() => {
        setOffer(null)
        // 目录换了必须重启 pi：模型与凭据是在启动时读进进程的
        useAppStore.getState().reconnectSession()
        void useProjectsStore.getState().refresh()
      })
      .catch((reason: unknown) => {
        setError(errorMessage(reason))
        setBusy(false)
      })
  }

  const dismiss = () => {
    setOffer(null)
    void skipImport().catch(() => undefined)
  }

  return (
    <Dialog
      title="导入 pi 的配置"
      confirmLabel="导入"
      busy={busy}
      onClose={dismiss}
      onConfirm={confirm}
    >
      <p className={styles.lead}>
        Piazza 现在用自己的配置目录，不再和 pi CLI 共用 <code>~/.pi/agent</code>
        ——两边同时开着也不会互相覆盖凭据和设置。可以把已有的配置搬过来：
      </p>

      <div className={styles.paths}>
        <span className={styles.pathRow}>
          <span className={styles.pathLabel}>从</span>
          <code className={styles.path}>{offer.source}</code>
        </span>
        <span className={styles.pathRow}>
          <span className={styles.pathLabel}>到</span>
          <code className={styles.path}>{offer.target}</code>
        </span>
      </div>

      <div className={styles.chips}>
        {offer.items.map((item) => (
          <code key={item} className={styles.chip}>
            {item}
          </code>
        ))}
      </div>

      {offer.sessionCount > 0 && (
        // 不用 <label> 包 Toggle：button 也是可标注元素，点一下可能触发两次切换
        <div className={styles.sessionRow}>
          <span
            className={styles.sessionText}
            onClick={() => setSessions((value) => !value)}
            role="presentation"
          >
            <span className={styles.sessionTitle}>同时导入历史会话</span>
            <span className={styles.sessionDesc}>
              {offer.sessionCount} 条，只复制不移动，pi CLI 那边照旧可用
            </span>
          </span>
          <Toggle checked={sessions} onChange={setSessions} ariaLabel="同时导入历史会话" />
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Dialog>
  )
}
