import { Card } from '@/design/primitives/Card'
import type { McpServerEntry } from '@/shared/api/agentResources'
import { McpServerRow } from '../components/McpServerRow'
import styles from './CapabilityList.module.css'

/** MCP 列表体：加载中 / 空态 / 每行 */
export function McpServerList({
  loading,
  entries,
  onToggle,
  onEdit,
  onDelete,
}: {
  loading: boolean
  entries: Array<[string, McpServerEntry]>
  onToggle: (name: string, entry: McpServerEntry, enabled: boolean) => void
  onEdit: (name: string) => void
  onDelete: (name: string) => void
}) {
  return (
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
              onToggle={(enabled) => onToggle(name, entry, enabled)}
              onEdit={() => onEdit(name)}
              onDelete={() => onDelete(name)}
            />
          ))
        )}
      </div>
    </Card>
  )
}
