import { useEffect, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import { searchProjectFiles, type FileHit } from '@/shared/api/files'
import { openPathWith } from '@/shared/api/pi'
import { useAppStore } from '@/store/app.store'
import styles from './FilesView.module.css'

/** 项目文件。空关键词时后端返回浅层优先的前 N 个，等同于一份概览 */
function useFiles(cwd: string | null, query: string) {
  const [items, setItems] = useState<FileHit[]>([])

  useEffect(() => {
    if (!cwd) return
    let cancelled = false
    searchProjectFiles(cwd, query)
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [cwd, query])

  return items
}

export function FilesView() {
  const cwd = useAppStore((s) => s.currentCwd)
  const [query, setQuery] = useState('')
  const files = useFiles(cwd, query)

  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
        <Search size={15} className={styles.searchIcon} />
        <input
          className={styles.search}
          placeholder="搜索文件"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {files.length === 0 ? (
        <div className={styles.empty}>没有匹配的文件</div>
      ) : (
        <div className={styles.list}>
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              className={styles.item}
              /* appPath 传空串即交给系统默认应用打开 */
              onClick={() => void openPathWith('', file.path)}
              title={file.path}
            >
              <FileText size={15} className={styles.icon} />
              <span className={styles.name}>{file.name}</span>
              <span className={styles.dir}>{file.dir}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
