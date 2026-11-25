import { useEffect, useRef, useState } from 'react'
import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { Segmented } from '@/design/primitives/Segmented'
import type { ThemeCustomization } from '@/design/themes/presets'
import { useAppStore } from '@/store/app.store'
import { ThemeCustomizerCard } from '../components/ThemeCustomizerCard'
import { ThemePresetGrid } from '../components/ThemePresetGrid'
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

/** 拖动取色器/滑块时样式 60fps 实时更新，磁盘保存合并防抖避免高频 I/O */
function useDebouncedAppearancePersist(update: AppSettingsHandle['update']) {
  const pendingRef = useRef<ThemeCustomization | null>(null)
  const timerRef = useRef<number | null>(null)

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    pendingRef.current = null
  }

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      if (pendingRef.current) update('appearance', pendingRef.current)
    },
    [update],
  )

  const schedule = (next: ThemeCustomization) => {
    pendingRef.current = next
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (pendingRef.current) {
        update('appearance', pendingRef.current)
        pendingRef.current = null
      }
    }, 180)
  }

  return { schedule, cancel }
}

/** 外观：明暗模式、个性化主题预设、自定义配色微调与对话字号均即时生效 */
export function AppearanceSection({ settings }: SectionProps) {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const appearance = useAppStore((s) => s.appearance)
  const setAppearance = useAppStore((s) => s.setAppearance)
  const [fontScale, setFontScale] = useState<FontScale>(readFontScale)
  const { schedule, cancel } = useDebouncedAppearancePersist(settings.update)

  const updateAppearance = (next: ThemeCustomization, immediate = false) => {
    setAppearance(next)
    if (immediate) {
      cancel()
      settings.update('appearance', next)
    } else {
      schedule(next)
    }
  }

  return (
    <>
      <Card title="主题与配色">
        <Row
          title="明暗模式"
          description="同步写入 settings.json，与窗口标题栏和系统材质保持一致"
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
                if (appearance.customSurface || appearance.customInk) {
                  const cleared = { ...appearance, customSurface: null, customInk: null }
                  cancel()
                  setAppearance(cleared)
                  settings.updateMany([['theme', next], ['appearance', cleared]])
                } else {
                  settings.update('theme', next)
                }
              }}
            />
          }
        />
        <ThemePresetGrid
          mode={theme}
          selected={appearance.preset}
          onSelect={(preset) =>
            updateAppearance({ ...appearance, preset, customSurface: null, customInk: null }, true)
          }
        />
      </Card>

      <ThemeCustomizerCard
        mode={theme}
        appearance={appearance}
        onChange={(next) => updateAppearance(next, false)}
      />

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
                const next: FontScale = value === 'compact' || value === 'large' ? value : 'normal'
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
