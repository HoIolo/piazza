import { FolderOpen, Trash2 } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import type { ExtensionEntry } from '@/shared/api/agentResources'
import { openPathWith } from '@/shared/api/pi'
import styles from './CapabilityList.module.css'

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

/**
 * 本地扩展脚本。
 *
 * 删除走系统确认框并移进废纸篓：这些是用户自己写的代码，
 * 手滑一次就得重写，值得打断一下。
 */
export function LocalExtensionsCard({
  extensions,
  extDir,
  onDelete,
}: {
  extensions: ExtensionEntry[]
  extDir: string
  onDelete: (ext: ExtensionEntry) => void
}) {
  return (
    <Card title={`本地扩展脚本 (${extDir || 'extensions'})`}>
      <div className={styles.list}>
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
              </div>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="在访达中打开"
                  aria-label="在访达中打开"
                  onClick={() => void openPathWith('', extDir || ext.path)}
                >
                  <FolderOpen size={14} />
                </button>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  title="移入废纸篓"
                  aria-label={`删除扩展 ${ext.name}`}
                  onClick={() => onDelete(ext)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
