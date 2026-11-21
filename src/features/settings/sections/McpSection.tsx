import { refreshRuntimeAfterSave } from '@/store/chat/refreshRuntime'
import { useEffect, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { FolderOpen, Plus } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import {
  getAgentDir,
  readMcpConfig,
  writeMcpConfig,
  type McpServerEntry,
} from '@/shared/api/agentResources'
import { openPathWith } from '@/shared/api/pi'
import { errorMessage } from '@/shared/utils/error'
import { McpDialog } from '../components/McpDialog'
import { McpServerRow } from '../components/McpServerRow'
import styles from './CapabilityList.module.css'

/** MCP 服务器管理：直接读写 ~/.pi/agent/mcp.json，与 pi CLI 完全互通 */
export function McpSection() {
  const [servers, setServers] = useState<Record<string, McpServerEntry>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentDir, setAgentDir] = useState('')
  const [dialog, setDialog] = useState<{ open: boolean; name: string | null }>({ open: false, name: null })

  useEffect(() => {
    let cancelled = false
    readMcpConfig()
      .then((cfg) => { if (!cancelled) setServers(cfg.mcpServers ?? {}) })
      .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    void getAgentDir()
      .then((dir) => { if (!cancelled) setAgentDir(dir) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const commitServers = async (next: Record<string, McpServerEntry>) => {
    const written = await writeMcpConfig({ mcpServers: next })
    refreshRuntimeAfterSave()
    setServers(written.mcpServers ?? {})
    setError(null)
  }

  const handleSave = async (name: string, entry: McpServerEntry, previousName: string | null) => {
    const next = { ...servers }
    if (previousName && previousName !== name) delete next[previousName]
    next[name] = entry
    await commitServers(next)
  }

  const handleDelete = async (name: string) => {
    const ok = await ask(`原文件将备份为 mcp.json.bak。确定移除「${name}」吗？`, {
      title: '删除 MCP 服务器', kind: 'warning', okLabel: '删除', cancelLabel: '取消',
    })
    if (!ok) return
    const next = { ...servers }
    delete next[name]
    void commitServers(next).catch((e: unknown) => setError(errorMessage(e)))
  }

  const entries = Object.entries(servers)

  return (
    <>
      <div className={styles.toolbar}>
        <code className={styles.pathMeta}>~/.pi/agent/mcp.json</code>
        <div className={styles.toolbarRight}>
          {agentDir && (
            <Pill icon={<FolderOpen size={13} />} onClick={() => void openPathWith('', agentDir)}>
              打开配置目录
            </Pill>
          )}
          <Pill icon={<Plus size={14} />} onClick={() => setDialog({ open: true, name: null })}>
            添加服务器
          </Pill>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <Card>
        <div className={styles.list}>
          {loading ? (
            <p className={styles.empty}>正在读取 mcp.json…</p>
          ) : entries.length === 0 ? (
            <p className={styles.empty}>尚未配置 MCP 服务器。点击「添加服务器」接入外部工具。</p>
          ) : (
            entries.map(([name, entry]) => (
              <McpServerRow
                key={name}
                name={name}
                entry={entry}
                onToggle={(enabled) => {
                  const next = { ...servers, [name]: { ...entry, enabled } }
                  setServers(next)
                  void commitServers(next).catch((e: unknown) => setError(errorMessage(e)))
                }}
                onEdit={() => setDialog({ open: true, name })}
                onDelete={() => void handleDelete(name)}
              />
            ))
          )}
        </div>
      </Card>

      {dialog.open && (
        <McpDialog
          servers={servers}
          editingName={dialog.name}
          onClose={() => setDialog({ open: false, name: null })}
          onSave={handleSave}
        />
      )}
    </>
  )
}
