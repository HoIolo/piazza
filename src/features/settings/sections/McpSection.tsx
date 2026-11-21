import { refreshRuntimeAfterSave } from '@/store/chat/refreshRuntime'
import { useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { FolderOpen, Plus } from 'lucide-react'
import { Pill } from '@/design/primitives/Pill'
import { writeMcpConfig, type McpServerEntry } from '@/shared/api/agentResources'
import { openPathWith } from '@/shared/api/pi'
import { errorMessage } from '@/shared/utils/error'
import { McpDialog } from '../components/McpDialog'
import { McpServerList } from './McpParts'
import { useAgentDirInto, useMcpLoad } from './mcpHooks'
import styles from './CapabilityList.module.css'

/** MCP 服务器管理：直接读写全局 mcp.json */
export function McpSection() {
  const [servers, setServers] = useState<Record<string, McpServerEntry>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentDir, setAgentDir] = useState('')
  const [dialog, setDialog] = useState<{ open: boolean; name: string | null }>({
    open: false,
    name: null,
  })

  useMcpLoad(setServers, setError, setLoading)
  useAgentDirInto(setAgentDir)

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
      title: '删除 MCP 服务器',
      kind: 'warning',
      okLabel: '删除',
      cancelLabel: '取消',
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
        <code className={styles.pathMeta}>{agentDir ? `${agentDir}/mcp.json` : 'mcp.json'}</code>
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

      <McpServerList
        loading={loading}
        entries={entries}
        onToggle={(name, entry, enabled) => {
          const next = { ...servers, [name]: { ...entry, enabled } }
          setServers(next)
          void commitServers(next).catch((e: unknown) => setError(errorMessage(e)))
        }}
        onEdit={(name) => setDialog({ open: true, name })}
        onDelete={(name) => void handleDelete(name)}
      />

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
