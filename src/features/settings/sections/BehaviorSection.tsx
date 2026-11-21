import { useMemo } from 'react'
import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { Select } from '@/design/primitives/Select'
import { Toggle } from '@/design/primitives/Toggle'
import { THINKING_OPTIONS } from '@/shared/utils/format'
import type { ProviderMap } from '../hooks/providerOps'
import { useModelsConfig } from '../hooks/useModelsConfig'
import type { SectionProps } from './AppearanceSection'

const TRUST_OPTIONS = [
  { value: 'ask', label: '每次询问' },
  { value: 'always', label: '始终信任' },
  { value: 'never', label: '从不信任' },
]

const RETRY_COUNT_OPTIONS = [
  { value: '1', label: '1 次' },
  { value: '2', label: '2 次' },
  { value: '3', label: '3 次' },
  { value: '5', label: '5 次' },
]

function encodeModelKey(provider: string, modelId: string): string {
  return provider && modelId ? `${provider}\0${modelId}` : ''
}

function decodeModelKey(key: string): [string, string] {
  const idx = key.indexOf('\0')
  return idx === -1 ? ['', ''] : [key.slice(0, idx), key.slice(idx + 1)]
}

function providerModelsOf(providerKey: string, provider: ProviderMap[string]) {
  const providerLabel = provider.name?.trim() || providerKey
  return (provider.models ?? []).map((m) => ({
    value: encodeModelKey(providerKey, m.id),
    label: `${m.name?.trim() || m.id} · ${providerLabel}`,
  }))
}

function buildModelOptions(providers: ProviderMap, defaultProvider: string, defaultModel: string) {
  const map = new Map<string, string>([['', '跟随 pi 默认']])
  for (const [key, provider] of Object.entries(providers)) {
    for (const item of providerModelsOf(key, provider)) {
      if (!map.has(item.value)) map.set(item.value, item.label)
    }
  }
  const currentKey = encodeModelKey(defaultProvider, defaultModel)
  if (currentKey && !map.has(currentKey)) {
    map.set(currentKey, `${defaultModel} · ${defaultProvider}`)
  }
  return Array.from(map, ([value, label]) => ({ value, label }))
}

/** Agent 行为：新会话的默认模型、思考等级、项目信任与运行策略 */
export function BehaviorSection({ settings }: SectionProps) {
  const { read, update, updateMany } = settings
  const { providers } = useModelsConfig()

  const defaultProvider = read('defaultProvider', '')
  const defaultModel = read('defaultModel', '')
  const currentKey = encodeModelKey(defaultProvider, defaultModel)
  const modelOptions = useMemo(
    () => buildModelOptions(providers, defaultProvider, defaultModel),
    [providers, defaultProvider, defaultModel],
  )
  const retryEnabled = read('retry.enabled', true)

  return (
    <>
      <Card title="会话默认项">
        <Row
          title="默认模型"
          description="开启新对话时默认使用的模型，列表同步自「模型与 Provider」"
          control={
            <Select
              value={currentKey}
              options={modelOptions}
              onChange={(value) => {
                const [provider, model] = decodeModelKey(value)
                updateMany([
                  ['defaultProvider', provider || undefined],
                  ['defaultModel', model || undefined],
                ])
              }}
            />
          }
        />
        <Row
          title="默认思考强度"
          description="新会话启动时的推理深度，可在输入框底部随时按会话覆盖"
          control={
            <Select
              value={read('defaultThinkingLevel', 'medium')}
              options={THINKING_OPTIONS}
              onChange={(v) => update('defaultThinkingLevel', v)}
            />
          }
        />
      </Card>

      <Card title="信任与安全">
        <Row
          title="项目信任策略"
          description="打开项目时是否自动加载该项目内的本地扩展、技能与 MCP 配置，未知仓库建议保持「每次询问」"
          control={
            <Select
              value={read('defaultProjectTrust', 'ask')}
              options={TRUST_OPTIONS}
              onChange={(v) => update('defaultProjectTrust', v)}
            />
          }
        />
      </Card>

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
    </>
  )
}
