import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { Select } from '@/design/primitives/Select'
import type { SectionProps } from './GeneralSection'

/** 权限：pi 的项目信任策略。决定项目本地扩展/技能是否自动加载 */
export function PermissionsSection({ settings }: SectionProps) {
  const { read, update } = settings

  return (
    <Card title="项目信任">
      <Row
        title="默认信任行为"
        description="打开新项目时，是否加载该项目下的本地扩展、技能与提示词。这些文件会随会话执行，来源不明的项目建议保持「每次询问」。"
        control={
          <Select
            value={read('defaultProjectTrust', 'ask')}
            options={[
              { value: 'ask', label: '每次询问' },
              { value: 'always', label: '始终信任' },
              { value: 'never', label: '从不信任' },
            ]}
            onChange={(v) => update('defaultProjectTrust', v)}
          />
        }
      />
    </Card>
  )
}
