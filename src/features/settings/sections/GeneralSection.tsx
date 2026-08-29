import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { Select } from '@/design/primitives/Select'
import { TextField } from '@/design/primitives/TextField'
import { Toggle } from '@/design/primitives/Toggle'
import { THINKING_OPTIONS } from '@/shared/utils/format'
import type { useAppSettings } from '../hooks/useAppSettings'
import { PiPathRow } from '../components/PiPathRow'

export interface SectionProps {
  settings: ReturnType<typeof useAppSettings>
}

/** 常规：pi 可执行文件位置与默认模型行为 */
export function GeneralSection({ settings }: SectionProps) {
  const { read, update } = settings

  return (
    <>
      <Card title="pi 运行时">
        <PiPathRow />
      </Card>

      <Card title="默认模型">
        <Row
          title="默认 Provider"
          description="新会话启动时使用的 provider 标识"
          stacked
          control={
            <TextField
              value={read('defaultProvider', '')}
              monospace
              placeholder="如 anthropic"
              onChange={(v) => update('defaultProvider', v)}
            />
          }
        />
        <Row
          title="默认模型"
          description="新会话启动时使用的模型 ID"
          stacked
          control={
            <TextField
              value={read('defaultModel', '')}
              monospace
              placeholder="如 claude-opus-5"
              onChange={(v) => update('defaultModel', v)}
            />
          }
        />
        <Row
          title="默认思考等级"
          control={
            <Select
              value={read('defaultThinkingLevel', 'medium')}
              options={THINKING_OPTIONS}
              onChange={(v) => update('defaultThinkingLevel', v)}
            />
          }
        />
        <Row
          title="隐藏思考过程"
          description="不在输出中展示模型的思考内容"
          control={
            <Toggle
              checked={read('hideThinkingBlock', false)}
              onChange={(v) => update('hideThinkingBlock', v)}
            />
          }
        />
      </Card>

      <Card title="网络">
        <Row
          title="HTTP 代理"
          description="同时作用于 HTTP_PROXY 与 HTTPS_PROXY"
          stacked
          control={
            <TextField
              value={read('httpProxy', '')}
              monospace
              placeholder="http://127.0.0.1:7890"
              onChange={(v) => update('httpProxy', v)}
            />
          }
        />
      </Card>
    </>
  )
}
