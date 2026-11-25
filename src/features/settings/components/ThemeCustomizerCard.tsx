import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import { Row } from '@/design/primitives/Row'
import { Toggle } from '@/design/primitives/Toggle'
import { normalizeCustomization } from '@/design/themes/applyTheme'
import {
  DEFAULT_CUSTOMIZATION,
  findThemePreset,
  type ThemeCustomization,
  type ThemeMode,
} from '@/design/themes/presets'
import { isMac } from '@/shared/utils/platform'
import styles from '../sections/AppearanceSection.module.css'
import { AccentSwatches, ColorPickerRow, ThemeActionsBar } from './ThemeColorControls'

export interface ThemeCustomizerCardProps {
  mode: ThemeMode
  appearance: ThemeCustomization
  onChange: (next: ThemeCustomization) => void
}

function useFlashHint() {
  const [hint, setHint] = useState('')
  const timerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])
  const flash = (text: string) => {
    setHint(text)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setHint(''), 2200)
  }
  return { hint, flash }
}

/** 个性化微调：强调色、对比度、侧栏透明材质、自定义画布/文字色与 JSON 导入导出 */
export function ThemeCustomizerCard({ mode, appearance, onChange }: ThemeCustomizerCardProps) {
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(appearance.customSurface || appearance.customInk),
  )
  const { hint, flash } = useFlashHint()
  const palette = findThemePreset(appearance.preset)[mode]
  const patch = (partial: Partial<ThemeCustomization>) => onChange({ ...appearance, ...partial })

  const copyTheme = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(appearance, null, 2))
      flash('已复制主题 JSON')
    } catch {
      flash('复制失败')
    }
  }

  const importTheme = async () => {
    try {
      const parsed = JSON.parse(await navigator.clipboard.readText()) as unknown
      onChange(normalizeCustomization(parsed))
      flash('已从剪贴板导入主题')
    } catch {
      flash('剪贴板中不是有效的主题 JSON')
    }
  }

  return (
    <Card title="个性化微调">
      <Row
        title="强调色"
        description="用于开关、选中态、链接与发送按钮，可随主题或自由取色"
        control={
          <AccentSwatches
            accent={appearance.accent}
            presetAccent={palette.accent}
            onSelect={(accent) => patch({ accent })}
          />
        }
      />
      <Row
        title="界面对比度"
        description="调节分割线与次要文字的清晰度，50 为标准"
        control={
          <div className={styles.sliderWrap}>
            <input
              type="range" min={25} max={85} step={5} value={appearance.contrast}
              className={styles.slider} aria-label="界面对比度"
              onChange={(e) => patch({ contrast: Number(e.target.value) })}
            />
            <span className={styles.sliderValue}>{appearance.contrast}%</span>
          </div>
        }
      />
      {isMac() && (
        <Row
          title="侧栏使用纯色背景"
          description="关闭系统毛玻璃透底，让所选主题的侧栏配色更纯粹"
          control={
            <Toggle checked={appearance.opaqueSidebar} onChange={(opaqueSidebar) => patch({ opaqueSidebar })} />
          }
        />
      )}
      <Row
        title="自定义画布与文字色"
        description="按个人喜好覆写当前主题的底色与主文字色"
        control={
          <Pill
            icon={<ChevronDown size={13} className={styles.drawerChevron} data-open={showAdvanced} />}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? '收起' : '展开'}
          </Pill>
        }
      />
      <div className={styles.advancedDrawer} data-open={showAdvanced} aria-hidden={!showAdvanced}>
        <div className={styles.advancedInner}>
          <ColorPickerRow
            title="画布底色" description="主对话区与卡片背景基色"
            value={appearance.customSurface} fallback={palette.surface}
            onChange={(customSurface) => patch({ customSurface })}
            onReset={() => patch({ customSurface: null })}
          />
          <ColorPickerRow
            title="主文字色" description="对话正文与标题前景色，次要文字与边框会自动派生"
            value={appearance.customInk} fallback={palette.ink}
            onChange={(customInk) => patch({ customInk })}
            onReset={() => patch({ customInk: null })}
          />
        </div>
      </div>
      <ThemeActionsBar
        appearance={appearance} hint={hint}
        onCopy={() => void copyTheme()} onImport={() => void importTheme()}
        onReset={() => { onChange({ ...DEFAULT_CUSTOMIZATION }); flash('已恢复默认外观') }}
      />
    </Card>
  )
}
