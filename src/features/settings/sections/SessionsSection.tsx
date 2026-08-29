import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { Select } from '@/design/primitives/Select'
import { TextField } from '@/design/primitives/TextField'
import { Toggle } from '@/design/primitives/Toggle'
import type { SectionProps } from './GeneralSection'

const QUEUE_MODES = [
  { value: 'one-at-a-time', label: '逐条发送' },
  { value: 'all', label: '一次性发送' },
]

/** 会话：压缩、重试与消息投递策略 */
export function SessionsSection({ settings }: SectionProps) {
  const { read, update } = settings
  const numberProps = (path: string, fallback: number) => ({
    value: String(read(path, fallback)),
    type: 'number' as const,
    onChange: (v: string) => update(path, Number(v) || fallback),
  })

  return (
    <>
      <Card title="上下文压缩">
        <Row
          title="自动压缩"
          description="上下文接近上限时自动总结较早的对话"
          control={
            <Toggle
              checked={read('compaction.enabled', true)}
              onChange={(v) => update('compaction.enabled', v)}
            />
          }
        />
        <Row
          title="为回复预留 token"
          control={<TextField {...numberProps('compaction.reserveTokens', 16384)} />}
        />
        <Row
          title="保留最近 token"
          description="这部分最近的对话不会被总结"
          control={<TextField {...numberProps('compaction.keepRecentTokens', 20000)} />}
        />
      </Card>

      <Card title="自动重试">
        <Row
          title="启用自动重试"
          description="遇到临时性错误时自动重试"
          control={
            <Toggle
              checked={read('retry.enabled', true)}
              onChange={(v) => update('retry.enabled', v)}
            />
          }
        />
        <Row title="最大重试次数" control={<TextField {...numberProps('retry.maxRetries', 3)} />} />
        <Row
          title="重试基础延迟（毫秒）"
          description="按指数退避递增：2s、4s、8s"
          control={<TextField {...numberProps('retry.baseDelayMs', 2000)} />}
        />
      </Card>

      <Card title="消息投递">
        <Row
          title="引导消息"
          description="生成过程中插入的消息如何送达"
          control={
            <Select
              value={read('steeringMode', 'one-at-a-time')}
              options={QUEUE_MODES}
              onChange={(v) => update('steeringMode', v)}
            />
          }
        />
        <Row
          title="追加消息"
          description="等待生成结束后送达的消息"
          control={
            <Select
              value={read('followUpMode', 'one-at-a-time')}
              options={QUEUE_MODES}
              onChange={(v) => update('followUpMode', v)}
            />
          }
        />
      </Card>
    </>
  )
}
