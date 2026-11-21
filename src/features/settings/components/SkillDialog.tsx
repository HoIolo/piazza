import { useState } from 'react'
import { Dialog } from '@/design/primitives/Dialog'
import { Field } from '@/design/primitives/Field'
import { Segmented } from '@/design/primitives/Segmented'
import { TextField } from '@/design/primitives/TextField'
import { saveAgentSkill, type SkillRecord } from '@/shared/api/agentResources'
import { errorMessage } from '@/shared/utils/error'
import styles from './FormDialog.module.css'

export interface SkillDialogProps {
  skill: SkillRecord | null
  cwd: string | null
  onClose: () => void
  onSaved: () => void
}

const DEFAULT_TEMPLATE = `---
name: my-skill
description: 简要描述该技能的用途与触发时机
---

# 技能说明

在此编写具体的操作步骤与规范。
`

function ScopeField({
  scope,
  cwd,
  onChange,
}: {
  scope: 'global' | 'project'
  cwd: string | null
  onChange: (scope: 'global' | 'project') => void
}) {
  const options = [{ value: 'global', label: '全局 (~/.pi/agent/skills)' }]
  if (cwd) options.push({ value: 'project', label: '当前项目 (.pi/skills)' })
  return (
    <Field label="作用范围">
      <Segmented
        value={scope}
        options={options}
        onChange={(v) => onChange(v === 'project' ? 'project' : 'global')}
      />
    </Field>
  )
}

/** 新建 / 编辑 SKILL.md 对话框 */
export function SkillDialog({ skill, cwd, onClose, onSaved }: SkillDialogProps) {
  const [scope, setScope] = useState<'global' | 'project'>(skill?.scope ?? 'global')
  const [slug, setSlug] = useState(skill?.id ?? '')
  const [content, setContent] = useState(skill?.content ?? DEFAULT_TEMPLATE)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isEditing = Boolean(skill)

  const submit = async () => {
    const cleanSlug = slug.trim()
    if (!cleanSlug) {
      setError('技能目录名不能为空')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveAgentSkill({ scope, cwd, slug: cleanSlug, content })
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={skill ? `编辑技能：${skill.name}` : '新建技能'}
      onClose={onClose}
      onConfirm={() => void submit()}
      busy={busy}
    >
      <div className={styles.form}>
        {!isEditing && <ScopeField scope={scope} cwd={cwd} onChange={setScope} />}
        <Field label="技能目录名" hint="仅支持英文字母、数字、连字符与下划线，例如 code-review">
          <TextField
            value={slug}
            monospace
            placeholder="my-skill"
            disabled={isEditing}
            autoFocus={!isEditing}
            ariaLabel="技能目录名"
            onChange={setSlug}
          />
        </Field>
        <Field label="SKILL.md 内容">
          <textarea
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />
        </Field>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
