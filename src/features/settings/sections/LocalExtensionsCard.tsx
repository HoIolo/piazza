import { useState } from 'react'
import { FolderOpen, Trash2 } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Dialog } from '@/design/primitives/Dialog'
import { deleteLocalExtension, type ExtensionEntry } from '@/shared/api/agentResources'
import { openPathWith } from '@/shared/api/pi'
import { errorMessage } from '@/shared/utils/error'
import { currentPlatform } from '@/shared/utils/platform'
import styles from './CapabilityList.module.css'

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

export function LocalExtensionsCard({
  extensions,
  agentDir,
  onDeleted,
}: {
  extensions: ExtensionEntry[]
  agentDir: string
  onDeleted: (path: string) => void
}) {
  const [target, setTarget] = useState<ExtensionEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ path: string; message: string } | null>(null)
  const windows = currentPlatform() === 'windows'
  const separator = windows ? '\\' : '/'
  const extDir = agentDir ? `${agentDir}${separator}extensions` : ''
  const trashLabel = windows ? 'Piazza 废纸篓' : '废纸篓'

  const confirmDelete = async () => {
    if (!target || busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteLocalExtension(target.path)
      onDeleted(target.path)
    } catch (reason: unknown) {
      setError({ path: target.path, message: errorMessage(reason) })
    } finally {
      setBusy(false)
      setTarget(null)
    }
  }

  return (
    <Card title={`本地扩展脚本 (${extDir || 'extensions'})`}>
      <div className={styles.list} inert={target !== null}>
        {extensions.length === 0 ? (
          <p className={styles.empty}>{extDir || 'extensions'} 下暂无本地扩展脚本</p>
        ) : (
          extensions.map((ext) => (
            <div key={ext.path} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemHead}>
                  <span className={styles.itemName}>{ext.name}</span>
                  <span className={styles.badge}>
                    {ext.isDir ? '目录' : formatSize(ext.sizeBytes)}
                  </span>
                </div>
                <span className={styles.itemPath}>{ext.path}</span>
                {error?.path === ext.path && (
                  <p className={styles.itemError} role="alert">
                    {error.message}
                  </p>
                )}
              </div>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="打开所在文件夹"
                  aria-label="打开所在文件夹"
                  onClick={() => void openPathWith('', extDir || ext.path)}
                >
                  <FolderOpen size={14} />
                </button>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  title={`移入${trashLabel}`}
                  aria-label={`删除扩展 ${ext.name}`}
                  onClick={() => setTarget(ext)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {target && (
        <Dialog
          title="删除扩展？"
          confirmLabel="移入废纸篓"
          busy={busy}
          onClose={() => {
            if (!busy) setTarget(null)
          }}
          onConfirm={() => void confirmDelete()}
        >
          <p>
            「{target.name}」会被移入{trashLabel}，之后 Pi 不再加载它。
          </p>
          {windows && agentDir && (
            <p className={styles.pathMeta}>{`${agentDir}${separator}.Trash`}</p>
          )}
        </Dialog>
      )}
    </Card>
  )
}
