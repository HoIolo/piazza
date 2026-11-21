import { useState } from 'react'
import { Dialog } from '@/design/primitives/Dialog'
import { Field } from '@/design/primitives/Field'
import { Segmented } from '@/design/primitives/Segmented'
import { TextField } from '@/design/primitives/TextField'
import type { McpServerEntry } from '@/shared/api/agentResources'
import { errorMessage } from '@/shared/utils/error'
import {
  buildMcpEntry,
  draftFromEntry,
  validateMcpDraft,
  type McpDraft,
  type McpTransport,
} from './mcpForm'
import styles from './FormDialog.module.css'

export interface McpDialogProps {
  servers: Record<string, McpServerEntry>
  editingName: string | null
  onClose: () => void
  onSave: (name: string, entry: McpServerEntry, previousName: string | null) => Promise<void>
}

function TransportFields({
  draft,
  patch,
}: {
  draft: McpDraft
  patch: (fields: Partial<McpDraft>) => void
}) {
  if (draft.transport === 'http') {
    return (
      <>
        <Field label="服务 URL">
          <TextField
            value={draft.url}
            monospace
            placeholder="https://example.com/mcp"
            ariaLabel="服务 URL"
            onChange={(url) => patch({ url })}
          />
        </Field>
        <Field label="请求头 (Headers)" hint="每行一个 Header=Value，可选">
          <textarea
            className={`${styles.textarea} ${styles.textareaCompact}`}
            value={draft.headersText}
            placeholder="Authorization=Bearer ..."
            onChange={(e) => patch({ headersText: e.target.value })}
            spellCheck={false}
          />
        </Field>
      </>
    )
  }
  return (
    <>
      <Field label="启动命令">
        <TextField
          value={draft.command}
          monospace
          placeholder="npx"
          ariaLabel="启动命令"
          onChange={(command) => patch({ command })}
        />
      </Field>
      <Field label="命令参数" hint="以空格分隔，例如 -y @upstash/context7-mcp">
        <TextField
          value={draft.argsText}
          monospace
          placeholder="-y @modelcontextprotocol/server-filesystem /path"
          ariaLabel="命令参数"
          onChange={(argsText) => patch({ argsText })}
        />
      </Field>
      <Field label="环境变量" hint="每行一个 KEY=VALUE，可选">
        <textarea
          className={`${styles.textarea} ${styles.textareaCompact}`}
          value={draft.envText}
          placeholder="API_KEY=..."
          onChange={(e) => patch({ envText: e.target.value })}
          spellCheck={false}
        />
      </Field>
    </>
  )
}

/** 新增 / 编辑 ~/.pi/agent/mcp.json 中的 MCP 服务器 */
export function McpDialog({ servers, editingName, onClose, onSave }: McpDialogProps) {
  const [draft, setDraft] = useState<McpDraft>(() =>
    draftFromEntry(editingName, editingName ? servers[editingName] : undefined),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const patch = (fields: Partial<McpDraft>) => setDraft((d) => ({ ...d, ...fields }))

  const submit = async () => {
    const problem = validateMcpDraft(draft, editingName, servers)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const previous = editingName ? servers[editingName] : undefined
      await onSave(draft.name.trim(), buildMcpEntry(draft, previous), editingName)
      onClose()
    } catch (e: unknown) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={editingName ? `编辑 MCP：${editingName}` : '添加 MCP 服务器'}
      onClose={onClose}
      onConfirm={() => void submit()}
      busy={busy}
    >
      <div className={styles.form}>
        <Field label="服务器名称">
          <TextField
            value={draft.name}
            monospace
            placeholder="如 context7 或 github"
            autoFocus
            ariaLabel="服务器名称"
            onChange={(name) => patch({ name })}
          />
        </Field>
        <Field label="传输方式">
          <Segmented
            value={draft.transport}
            options={[
              { value: 'stdio', label: '本地命令 (stdio)' },
              { value: 'http', label: '远程地址 (HTTP)' },
            ]}
            onChange={(v) => patch({ transport: v as McpTransport })}
          />
        </Field>
        <TransportFields draft={draft} patch={patch} />
        <Field label="备注说明（可选）">
          <TextField
            value={draft.description}
            placeholder="简要描述该 MCP 提供的工具"
            ariaLabel="备注说明"
            onChange={(description) => patch({ description })}
          />
        </Field>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Dialog>
  )
}
