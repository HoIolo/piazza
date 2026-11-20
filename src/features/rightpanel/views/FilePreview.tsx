import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Globe, Plus } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { openPathWith } from '@/shared/api/pi'
import { ImagePreview } from '@/shared/components/ImagePreview'
import { tokenizeCode, type SyntaxTokenType } from '@/shared/components/Markdown/highlight'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useChatStore } from '@/store/chat'
import { loadPreview, type FileContent } from './loadPreview'
import styles from './FilesView.module.css'

const TOKEN_CLASS: Record<SyntaxTokenType, string> = {
  comment: styles.tokComment,
  keyword: styles.tokKeyword,
  literal: styles.tokLiteral,
  string: styles.tokString,
  variable: styles.tokVariable,
  attribute: styles.tokAttribute,
  name: styles.tokName,
}

export function FilePreview({ cwd, path, back }: { cwd: string; path: string; back: () => void }) {
  const [result, setResult] = useState<FileContent>()
  const [actionError, setActionError] = useState('')
  const [added, setAdded] = useState(false)
  const openBrowserFile = useAppStore((s) => s.openBrowserFile)
  const isHtml = /\.html?$/i.test(path)

  useEffect(() => {
    let active = true
    void loadPreview(cwd, path).then(
      (loaded) => {
        if (active) setResult(loaded)
      },
      (reason: unknown) => {
        if (active) setResult({ error: errorMessage(reason) })
      },
    )
    return () => {
      active = false
    }
  }, [cwd, path])

  function addToChat() {
    const { draft, setDraft } = useChatStore.getState()
    const reference = path.includes(' ') ? JSON.stringify(path) : path
    setDraft(`${draft.trimEnd()}${draft.trim() ? ' ' : ''}${reference} `)
    setAdded(true)
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.searchRow}>
        <IconButton size="sm" ariaLabel="返回文件列表" onClick={back}>
          <ArrowLeft size={15} />
        </IconButton>
        <span className={styles.previewPath} title={path}>
          {path}
        </span>
        {isHtml && (
          <IconButton
            size="sm"
            ariaLabel="在内置浏览器中打开"
            title="在内置浏览器中打开"
            onClick={() => openBrowserFile(`${cwd.replace(/\/$/, '')}/${path}`)}
          >
            <Globe size={14} />
          </IconButton>
        )}
        <IconButton
          size="sm"
          ariaLabel={added ? '已加入主对话草稿' : '加入主对话草稿'}
          active={added}
          onClick={addToChat}
        >
          <Plus size={15} />
        </IconButton>
        <IconButton
          size="sm"
          ariaLabel="用系统应用打开"
          onClick={() => {
            void openPathWith('', `${cwd.replace(/\/$/, '')}/${path}`).catch((reason: unknown) =>
              setActionError(errorMessage(reason)),
            )
          }}
        >
          <ExternalLink size={14} />
        </IconButton>
      </header>
      {actionError && (
        <p className={styles.empty} role="alert">
          {actionError}
        </p>
      )}
      <PreviewContent result={result} path={path} />
    </div>
  )
}

function HighlightedCode({ content, ext }: { content: string; ext: string }) {
  const tokens = useMemo(() => tokenizeCode(content, ext), [content, ext])
  if (!tokens) return <>{content || '空文件'}</>
  return (
    <>
      {tokens.map((tok, i) =>
        tok.type ? (
          <span key={i} className={TOKEN_CLASS[tok.type]}>
            {tok.text}
          </span>
        ) : (
          tok.text
        ),
      )}
    </>
  )
}

function PreviewContent({ result, path }: { result: FileContent | undefined; path: string }) {
  if (!result) {
    return (
      <p className={styles.empty} role="status">
        正在读取…
      </p>
    )
  }
  if ('image' in result) {
    return (
      <div className={styles.imagePreview}>
        <ImagePreview src={result.image} alt={path} />
      </div>
    )
  }
  if ('content' in result) {
    const ext = path.split('.').pop() ?? ''
    return (
      <pre className={`${styles.preview} selectable`}>
        <HighlightedCode content={result.content} ext={ext} />
      </pre>
    )
  }
  return (
    <p className={styles.empty} role="alert">
      {result.error}
    </p>
  )
}
