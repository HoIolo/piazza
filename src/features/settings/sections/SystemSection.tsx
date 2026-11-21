import { useEffect, useState } from 'react'
import { FolderOpen, RotateCw } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import { Row } from '@/design/primitives/Row'
import { Segmented } from '@/design/primitives/Segmented'
import { TextField } from '@/design/primitives/TextField'
import { getAgentDir } from '@/shared/api/agentResources'
import { openPathWith } from '@/shared/api/pi'
import { useAppStore } from '@/store/app.store'
import { PiPathRow } from '../components/PiPathRow'
import type { SectionProps } from './AppearanceSection'
import styles from './SystemSection.module.css'

/** 运行时与系统：pi 路径、网络代理与配置数据目录 */
export function SystemSection({ settings }: SectionProps) {
  const { read, update } = settings
  const savedProxy = read('httpProxy', '')
  const [forceCustom, setForceCustom] = useState(false)
  const [proxyDraft, setProxyDraft] = useState<string | null>(null)
  const [agentDir, setAgentDir] = useState('~/.pi/agent')
  const reconnectSession = useAppStore((s) => s.reconnectSession)

  useEffect(() => {
    void getAgentDir()
      .then(setAgentDir)
      .catch(() => undefined)
  }, [])

  const isCustom = forceCustom || Boolean(savedProxy)
  const displayedProxy = proxyDraft ?? savedProxy

  const applyProxy = () => {
    const trimmed = displayedProxy.trim()
    update('httpProxy', trimmed || undefined)
    setProxyDraft(null)
    if (!trimmed) setForceCustom(false)
  }

  return (
    <>
      <Card title="pi 运行时">
        <PiPathRow />
        <Row
          title="重启后台 pi 进程"
          description="修改代理、扩展包或 MCP 配置后，可立即重新拉起 pi 会话进程使其生效"
          control={
            <Pill icon={<RotateCw size={13} />} onClick={reconnectSession}>
              重新连接
            </Pill>
          }
        />
      </Card>

      <Card title="网络代理">
        <Row
          title="代理模式"
          description="自定义代理将同时应用于 HTTP_PROXY 与 HTTPS_PROXY"
          control={
            <Segmented
              value={isCustom ? 'custom' : 'system'}
              options={[
                { value: 'system', label: '跟随系统' },
                { value: 'custom', label: '自定义' },
              ]}
              onChange={(mode) => {
                if (mode === 'system') {
                  setForceCustom(false)
                  setProxyDraft(null)
                  if (savedProxy) update('httpProxy', undefined)
                } else {
                  setForceCustom(true)
                }
              }}
            />
          }
        />
        {isCustom && (
          <Row
            title="代理地址"
            stacked
            control={
              <div className={styles.proxyRow}>
                <TextField
                  value={displayedProxy}
                  monospace
                  placeholder="http://127.0.0.1:7890"
                  onChange={setProxyDraft}
                />
                <Pill onClick={applyProxy} disabled={displayedProxy.trim() === savedProxy}>
                  应用
                </Pill>
              </div>
            }
          />
        )}
      </Card>

      <Card title="数据与配置">
        <Row
          title="配置目录"
          description={<code className={styles.pathCode}>{agentDir}</code>}
          control={
            <Pill icon={<FolderOpen size={13} />} onClick={() => void openPathWith('', agentDir)}>
              在访达中打开
            </Pill>
          }
        />
      </Card>
    </>
  )
}
