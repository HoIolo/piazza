import { useState } from 'react'
import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { Segmented } from '@/design/primitives/Segmented'
import { useAppStore } from '@/store/app.store'
import type { AppSettingsHandle } from '../hooks/useAppSettings'

export interface SectionProps {
  settings: AppSettingsHandle
}

type FontScale = 'compact' | 'normal' | 'large'

function readFontScale(): FontScale {
  const saved = localStorage.getItem('piazza.fontSize')
  return saved === 'compact' || saved === 'large' ? saved : 'normal'
}

function applyFontScale(scale: FontScale): void {
  if (scale === 'normal') {
    localStorage.removeItem('piazza.fontSize')
    delete document.documentElement.dataset.fontSize
  } else {
    localStorage.setItem('piazza.fontSize', scale)
    document.documentElement.dataset.fontSize = scale
  }
}

/** 外观：主题与排版字号均即时生效 */
export function AppearanceSection({ settings }: SectionProps) {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const [fontScale, setFontScale] = useState<FontScale>(readFontScale)

  return (
    <>
      <Card title="主题">
        <Row
          title="界面主题"
          description="同步写入 ~/.pi/agent/settings.json，浅色与深色模式即时切换"
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

      <Card title="排版">
        <Row
          title="对话字号"
          description="调节聊天消息正文与代码块的基础字号"
          control={
            <Segmented
              value={fontScale}
              options={[
                { value: 'compact', label: '紧凑' },
                { value: 'normal', label: '标准' },
                { value: 'large', label: '宽松' },
              ]}
              onChange={(value) => {
                const next: FontScale =
                  value === 'compact' || value === 'large' ? value : 'normal'
                setFontScale(next)
                applyFontScale(next)
              }}
            />
          }
        />
      </Card>
    </>
  )
}
