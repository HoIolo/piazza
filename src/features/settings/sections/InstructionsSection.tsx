import { useEffect, useState } from 'react'
import { Check, FolderOpen, Save } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import {
  readGlobalInstructions,
  writeGlobalInstructions,
  type InstructionDoc,
} from '@/shared/api/agentResources'
import { openPathWith } from '@/shared/api/pi'
import { errorMessage } from '@/shared/utils/error'
import styles from './InstructionsSection.module.css'

function HeaderActions({
  parentDir,
  saved,
  saving,
  dirty,
  onSave,
}: {
  parentDir: string
  saved: boolean
  saving: boolean
  dirty: boolean
  onSave: () => void
}) {
  return (
    <div className={styles.actions}>
      {saved && (
        <span className={styles.savedBadge}>
          <Check size={13} /> 已保存
        </span>
      )}
      {parentDir && (
        <Pill icon={<FolderOpen size={13} />} onClick={() => void openPathWith('', parentDir)}>
          在访达中打开
        </Pill>
      )}
      <button
        type="button"
        className={styles.primaryBtn}
        disabled={!dirty || saving}
        onClick={onSave}
      >
        <Save size={13} />
        {saving ? '保存中' : '保存指令'}
      </button>
    </div>
  )
}

/** 全局指令：编辑 ~/.pi/agent/AGENTS.md，对所有项目的会话生效 */
export function InstructionsSection() {
  const [doc, setDoc] = useState<InstructionDoc | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    readGlobalInstructions()
      .then((res) => {
        if (cancelled) return
        setDoc(res)
        setDraft(res.content)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await writeGlobalInstructions(draft)
      setDoc(updated)
      setDraft(updated.content)
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (e: unknown) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const parentDir = doc?.path.replace(/\/[^/]+$/, '') ?? ''

  return (
    <>
      {error && <p className={styles.error}>{error}</p>}
      <Card title="全局 AGENTS.md">
        <div className={styles.header}>
          <code className={styles.path}>{doc?.path ?? '~/.pi/agent/AGENTS.md'}</code>
          <HeaderActions
            parentDir={parentDir}
            saved={saved}
            saving={saving}
            dirty={doc !== null && draft !== doc.content}
            onSave={() => void handleSave()}
          />
        </div>
        <div className={styles.editorWrap}>
          <textarea
            className={styles.editor}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="在此编写全局系统规范，例如：回复语言偏好、代码风格约定、提交规范等。pi 会在每个项目启动会话时自动加载。"
            spellCheck={false}
          />
        </div>
      </Card>
    </>
  )
}
