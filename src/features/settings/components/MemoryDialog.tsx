import { useState } from 'react'
import { Dialog } from '@/design/primitives/Dialog'
import { Field } from '@/design/primitives/Field'
import { Segmented } from '@/design/primitives/Segmented'
import { Select } from '@/design/primitives/Select'
import { TextField } from '@/design/primitives/TextField'
import {
  MEMORY_CATEGORY_OPTIONS,
  saveMemory,
  type MemoryCategory,
  type MemoryItem,
  type MemoryScope,
} from '@/shared/api/memory'
import { errorMessage } from '@/shared/utils/error'
import styles from './FormDialog.module.css'

export interface MemoryDialogProps {
  item: MemoryItem | null
  cwd: string | null
  projectName: string | null
  defaultScope: MemoryScope
  onClose: () => void
  onSaved: () => void
}

interface DraftState {
  scope: MemoryScope
  title: string
  category: MemoryCategory
  summary: string
  tagsRaw: string
  content: string
}

function makeInitialDraft(
  item: MemoryItem | null,
  cwd: string | null,
  defaultScope: MemoryScope,
): DraftState {
  if (item) {
    return {
      scope: item.scope,
      title: item.title,
      category: item.category,
      summary: item.summary,
      tagsRaw: item.tags.join(', '),
      content: item.content,
    }
  }
  return {
    scope: cwd ? defaultScope : 'global',
    title: '',
    category: 'general',
    summary: '',
    tagsRaw: '',
    content: '',
  }
}

const parseTagInput = (raw: string) =>
  raw
    .split(/[\s,，]+/)
    .map((t) => t.trim().replace(/^#+/, ''))
    .filter(Boolean)

/** 新建 / 编辑长期记忆对话框 */
export function MemoryDialog({
  item,
  cwd,
  projectName,
  defaultScope,
  onClose,
  onSaved,
}: MemoryDialogProps) {
  const [form, setForm] = useState<DraftState>(() => makeInitialDraft(item, cwd, defaultScope))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const patch = <K extends keyof DraftState>(key: K, val: DraftState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const scopeOptions = [
    ...(cwd
      ? [{ value: 'project', label: projectName ? `当前项目（${projectName}）` : '当前项目' }]
      : []),
    { value: 'global', label: '全局（所有项目生效）' },
  ]

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('标题和记忆内容不能为空')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveMemory(cwd, {
        scope: form.scope,
        id: item?.id ?? null,
        title: form.title.trim(),
        category: form.category,
        summary: form.summary.trim() || undefined,
        tags: parseTagInput(form.tagsRaw),
        content: form.content.trim(),
      })
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={item ? `编辑记忆：${item.title}` : '新建记忆'}
      onClose={onClose}
      onConfirm={() => void submit()}
      busy={busy}
    >
      <div className={styles.form}>
        {!item && (
          <Field label="作用范围">
            <Segmented
              value={form.scope}
              options={scopeOptions}
              onChange={(v) => patch('scope', v === 'project' ? 'project' : 'global')}
            />
          </Field>
        )}
        <Field label="标题">
          <TextField value={form.title} placeholder="例如：统一使用 pnpm 安装依赖" autoFocus ariaLabel="记忆标题" onChange={(v) => patch('title', v)} />
        </Field>
        <Field label="分类">
          <Select value={form.category} options={MEMORY_CATEGORY_OPTIONS} onChange={(v) => patch('category', v as MemoryCategory)} />
        </Field>
        <Field label="一句话摘要" hint="注入系统提示词索引时展示；留空则自动取正文首行">
          <TextField value={form.summary} placeholder="可选，简明扼要概括这条记忆" ariaLabel="记忆摘要" onChange={(v) => patch('summary', v)} />
        </Field>
        <Field label="标签" hint="用逗号或空格分隔，例如 pnpm, build">
          <TextField value={form.tagsRaw} placeholder="pnpm, build" ariaLabel="记忆标签" onChange={(v) => patch('tagsRaw', v)} />
        </Field>
        <Field label="记忆内容（Markdown）">
          <textarea className={styles.textarea} value={form.content} onChange={(e) => patch('content', e.target.value)} placeholder="记录偏好、架构决定、构建/测试命令或避坑经验…" spellCheck={false} />
        </Field>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
