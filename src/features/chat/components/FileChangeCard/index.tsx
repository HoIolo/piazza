import { useState } from 'react'
import { Diff, Undo2 } from 'lucide-react'
import { Pill } from '@/design/primitives/Pill'
import { openLink } from '@/shared/utils/openLink'
import { useAppStore } from '@/store/app.store'
import styles from './FileChangeCard.module.css'

export interface FileChange {
  path: string
  additions: number
  deletions: number
}

export interface FileChangeCardProps {
  changes: FileChange[]
  cwd?: string | null
  onReview?: () => void
  onUndo?: () => void
}

/** 默认展开的文件行数，其余折叠在「再显示 N 个文件」后面 */
const VISIBLE_COUNT = 3

/** 把路径拆成目录与文件名，截图里两者用不同深浅的灰显示 */
function splitPath(path: string): [string, string] {
  const index = path.lastIndexOf('/')
  return index === -1 ? ['', path] : [path.slice(0, index + 1), path.slice(index + 1)]
}

export function FileChangeCard({ changes, cwd = null, onReview, onUndo }: FileChangeCardProps) {
  const [expanded, setExpanded] = useState(false)
  if (changes.length === 0) return null

  const handleReview = onReview ?? (() => useAppStore.getState().openRightPanelView('review'))
  const visible = expanded ? changes : changes.slice(0, VISIBLE_COUNT)
  const hidden = changes.length - visible.length
  const totals = changes.reduce(
    (acc, c) => ({ add: acc.add + c.additions, del: acc.del + c.deletions }),
    { add: 0, del: 0 },
  )

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <div className={styles.badge}>
          <Diff size={15} />
        </div>
        <div className={styles.headerText}>
          <div className={styles.title}>已编辑 {changes.length} 个文件</div>
          <div className={styles.stats}>
            <span className={styles.add}>+{totals.add.toLocaleString()}</span>
            <span className={styles.del}>-{totals.del.toLocaleString()}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <Pill variant="ghost" icon={<Undo2 size={14} />} onClick={onUndo}>
            撤销
          </Pill>
          <Pill onClick={handleReview}>审核</Pill>
        </div>
      </header>

      <ul className={styles.files}>
        {visible.map((change) => {
          const [dir, name] = splitPath(change.path)
          return (
            <li
              key={change.path}
              className={styles.file}
              role="button"
              tabIndex={0}
              onClick={() => void openLink(change.path, cwd)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  void openLink(change.path, cwd)
                }
              }}
            >
              <span className={styles.path}>
                <span className={styles.dir}>{dir}</span>
                <span className={styles.name}>{name}</span>
              </span>
              <span className={styles.fileStats}>
                <span className={styles.add}>+{change.additions}</span>
                <span className={styles.del}>-{change.deletions}</span>
              </span>
            </li>
          )
        })}
      </ul>

      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          再显示 {hidden} 个文件
        </button>
      )}
    </div>
  )
}
