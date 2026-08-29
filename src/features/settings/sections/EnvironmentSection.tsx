import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { TextField } from '@/design/primitives/TextField'
import { Toggle } from '@/design/primitives/Toggle'
import type { SectionProps } from './GeneralSection'

/** 环境：外部编辑器与图片处理 */
export function EnvironmentSection({ settings }: SectionProps) {
  const { read, update } = settings

  return (
    <>
      <Card title="外部编辑器">
        <Row
          title="编辑器命令"
          description="留空则依次回退到 $VISUAL、$EDITOR"
          stacked
          control={
            <TextField
              value={read('externalEditor', '')}
              monospace
              placeholder="如 code -w"
              onChange={(v) => update('externalEditor', v)}
            />
          }
        />
      </Card>

      <Card title="图片">
        <Row
          title="自动压缩"
          description="发送前将图片缩放到 2000×2000 以内"
          control={
            <Toggle
              checked={read('images.autoResize', true)}
              onChange={(v) => update('images.autoResize', v)}
            />
          }
        />
        <Row
          title="禁止发送图片"
          description="拦截所有图片，不发送给模型"
          control={
            <Toggle
              checked={read('images.blockImages', false)}
              onChange={(v) => update('images.blockImages', v)}
            />
          }
        />
      </Card>
    </>
  )
}
