import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import { Row } from '@/design/primitives/Row'
import { Segmented } from '@/design/primitives/Segmented'
import { Select } from '@/design/primitives/Select'
import { TextField } from '@/design/primitives/TextField'
import { Toggle } from '@/design/primitives/Toggle'
import { getAgentDir } from '@/shared/api/agentResources'
import { openPathWith } from '@/shared/api/pi'
import type { SectionProps } from './AppearanceSection'
import { ComputerUseCard } from './ComputerUseCard'
import styles from './SystemSection.module.css'

const RETRY_COUNT_OPTIONS = [
  { value: '1', label: '1 次' },
  { value: '2', label: '2 次' },
  { value: '3', label: '3 次' },
  { value: '5', label: '5 次' },
]

/**
 * 这三项都是 pi settings.json 里真实生效的运行策略（见 pi 的 settings-schema），
 * 原先挂在已移除的「Agent 行为」页，挪到这里。单独成组件是为了守住行数上限。
 */
function RuntimePolicyCard({ settings }: SectionProps) {
  const { read, update } = settings
  const retryEnabled = read('retry.enabled', true)
  return (
    <Card title="执行与容错">
      <Row
        title="自动压缩上下文"
        description="当对话接近当前模型设定的上下文上限（80%）时，自动总结早期历史以防溢出"
        control={
          <Toggle
            checked={read('compaction.enabled', true)}
            onChange={(v) => update('compaction.enabled', v)}
          />
        }
      />
      <Row
        title="遇错自动重试"
        description="遭遇网络抖动或服务端限流等临时性错误时自动指数退避重试"
        control={<Toggle checked={retryEnabled} onChange={(v) => update('retry.enabled', v)} />}
      />
      {retryEnabled && (
        <Row
          title="最大重试次数"
          control={
            <Select
              value={String(read('retry.maxRetries', 3))}
              options={RETRY_COUNT_OPTIONS}
              onChange={(v) => update('retry.maxRetries', Number(v))}
            />
          }
        />
      )}
      <Row
        title="图片发送前自动缩放"
        description="将超大图片缩放至 2000×2000 以内再提交给模型，兼顾清晰度与 token 占用"
        control={
          <Toggle
            checked={read('images.autoResize', true)}
            onChange={(v) => update('images.autoResize', v)}
          />
        }
      />
    </Card>
  )
}

/** 运行时与系统：内置 Pi SDK、网络代理、执行容错与配置数据目录 */
export function SystemSection({ settings }: SectionProps) {
  const { read, update } = settings
  const savedProxy = read('httpProxy', '')
  const [forceCustom, setForceCustom] = useState(false)
  const [proxyDraft, setProxyDraft] = useState<string | null>(null)
  const [agentDir, setAgentDir] = useState('')

  useEffect(() => {
    void getAgentDir()
      .then(setAgentDir)
      .catch(() => undefined)
  }, [])

  const isCustom = forceCustom || Boolean(savedProxy)
  const displayedProxy = proxyDraft ?? savedProxy

  const applyProxy = () => {
    const trimmed = displayedProxy.trim()
    update('httpProxy', trimmed)
    setProxyDraft(null)
    if (!trimmed) setForceCustom(false)
  }

  return (
    <>
      <Card title="运行时">
        <Row title="运行时来源" description="Piazza 内置 Pi SDK、Node.js 与 Open Computer Use，无需另装" />
      </Card>

      <ComputerUseCard settings={settings} />

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
                  if (savedProxy) update('httpProxy', '')
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

      <RuntimePolicyCard settings={settings} />

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
