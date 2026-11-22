import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, FileText, Folder, Search } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { listWorkspaceDir, searchProjectFiles, type WorkspaceEntry } from '@/shared/api/files'
import { errorMessage } from '@/shared/utils/error'
import { basename } from '@/shared/utils/path'
import { useAppStore } from '@/store/app.store'
import { FilePreview } from './FilePreview'
import styles from './FilesView.module.css'

type Entry = WorkspaceEntry & { dir?: string }

function useEntries(cwd: string, path: string, query: string) {
  const key = JSON.stringify([path, query])
  const [loaded, setLoaded] = useState<{ key: string; entries: Entry[]; error?: string }>()
  useEffect(() => {
    let active = true
    const request = query
      ? searchProjectFiles(cwd, query).then((files) =>
          files.map((file) => ({ ...file, directory: false })),
        )
      : listWorkspaceDir(cwd, path)
    void request.then(
      (entries) => {
        if (active) setLoaded({ key, entries })
      },
      (reason: unknown) => {
        if (active) setLoaded({ key, entries: [], error: errorMessage(reason) })
      },
    )
    return () => {
      active = false
    }
  }, [cwd, path, query, key])
  return loaded?.key === key ? loaded : undefined
}

function FileList({
  loaded,
  searching,
  onOpen,
}: {
  loaded: ReturnType<typeof useEntries>
  searching: boolean
  onOpen: (entry: Entry) => void
}) {
  let state: ReactNode
  if (!loaded)
    state = (
      <p className={styles.empty} role="status">
        正在读取文件…
      </p>
    )
  else if (loaded.error)
    state = (
      <p className={styles.empty} role="alert">
        {loaded.error}
      </p>
    )
  else if (!loaded.entries.length)
    state = <p className={styles.empty}>{searching ? '没有匹配的文件' : '此文件夹为空'}</p>
  if (state) return <div className={styles.list}>{state}</div>

  return (
    <div className={styles.list}>
      {loaded?.entries.map((entry) => (
        <FileRow key={entry.path} entry={entry} onOpen={() => onOpen(entry)} />
      ))}
    </div>
  )
}

function FileRow({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const { name, path, directory, dir } = entry
  const Icon = directory ? Folder : FileText
  return (
    <button type="button" className={styles.item} title={path} onClick={onOpen}>
      {/*
        只保留一个 16px 图标栏，和 Codex 的 [data-item-section='icon'] 一致：
        该栏固定 width: --trees-icon-width，放的是箭头或文件图标之一。
        目录用箭头（Codex 的 file-tree-icon-chevron 就渲染在这一栏里），
        文件用类型图标，于是两类行的文字起点都落在同一处。
      */}
      {directory ? (
        <ChevronRight size={16} className={styles.icon} aria-hidden />
      ) : (
        <Icon size={16} className={styles.icon} />
      )}
      <span className={styles.name}>{name}</span>
      {dir && <span className={styles.dir}>{dir}</span>}
    </button>
  )
}

function WorkspaceFiles({ cwd }: { cwd: string }) {
  const file = useAppStore((s) => s.filePreviewTarget?.path ?? null)
  const setFile = useAppStore((s) => s.setFilePreviewPath)
  const openBrowserFile = useAppStore((s) => s.openBrowserFile)
  const [query, setQuery] = useState('')
  const [dir, setDir] = useState('')
  const search = query.trim()
  const loaded = useEntries(cwd, dir, search)

  if (file) return <FilePreview key={file} cwd={cwd} path={file} back={() => setFile(null)} />

  const openEntry = (entry: Entry) => {
    if (entry.directory) {
      setDir(entry.path)
      return
    }
    if (/\.html?$/i.test(entry.path)) {
      openBrowserFile(`${cwd.replace(/\/$/, '')}/${entry.path}`)
      return
    }
    setFile(entry.path)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
        <Search size={14} className={styles.searchIcon} aria-hidden />
        <input
          className={styles.search}
          aria-label="搜索项目文件"
          placeholder="搜索项目文件"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {!search && (
        <div className={styles.directory} title={dir || cwd}>
          {dir && (
            <IconButton
              size="sm"
              ariaLabel="上一级目录"
              onClick={() => setDir(dir.split('/').slice(0, -1).join('/'))}
            >
              <ArrowLeft size={14} />
            </IconButton>
          )}
          <span>{dir || basename(cwd) || cwd}</span>
        </div>
      )}
      <FileList loaded={loaded} searching={!!search} onOpen={openEntry} />
    </div>
  )
}

export function FilesView() {
  const cwd = useAppStore((s) => s.currentCwd)
  return cwd ? (
    <WorkspaceFiles key={cwd} cwd={cwd} />
  ) : (
    <p className={styles.empty}>请选择一个项目。</p>
  )
}
