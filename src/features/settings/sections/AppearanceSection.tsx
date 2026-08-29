import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { Segmented } from '@/design/primitives/Segmented'
import { useAppStore } from '@/store/app.store'
import type { SectionProps } from './GeneralSection'

/** 外观：主题在窗口内即时生效，同时写回 pi 的 settings.json */
export function AppearanceSection({ settings }: SectionProps) {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)

  return (
    <Card title="主题">
      <Row
        title="界面主题"
        description="与 pi 终端界面共用 settings.json 中的 theme 设置"
        control={
          <Segmented
            value={theme}
            options={[
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
            ]}
            onChange={(value) => {
              const next = value === 'dark' ? 'dark' : 'light'
              setTheme(next)
              settings.update('theme', next)
            }}
          />
        }
      />
    </Card>
  )
}
