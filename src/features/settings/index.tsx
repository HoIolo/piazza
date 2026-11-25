import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { normalizeCustomization } from '@/design/themes/applyTheme'
import { Spinner } from '@/design/primitives/Spinner'
import { useAppStore } from '@/store/app.store'
import { SectionContent } from './components/SectionContent'
import { SettingsSidebar } from './components/SettingsSidebar'
import { useAppSettings } from './hooks/useAppSettings'
import { DEFAULT_SECTION, SECTION_META, type SectionId } from './sections'
import styles from './SettingsView.module.css'

function resolveInitialSection(value: string | null | undefined): SectionId {
  if (value && value in SECTION_META) return value as SectionId
  return DEFAULT_SECTION
}

export interface SettingsViewProps {
  /** 由外部指定的初始分区，如侧栏「扩展包」直达 packages */
  initialSection?: string | null
}

/** 设置视图。内嵌在主窗口里，覆盖三栏布局，对齐 PI-Desktop 即时保存与页头说明 */
export function SettingsView({ initialSection }: SettingsViewProps) {
  const [current, setCurrent] = useState<SectionId>(() => resolveInitialSection(initialSection))
  const [query, setQuery] = useState('')
  const settings = useAppSettings()
  const setTheme = useAppStore((s) => s.setTheme)
  const setAppearance = useAppStore((s) => s.setAppearance)
  const closeSettings = useAppStore((s) => s.closeSettings)

  useEffect(() => {
    if (settings.settings.appearance) {
      setAppearance(normalizeCustomization(settings.settings.appearance))
    }
    const theme = settings.settings.theme
    if (theme === 'dark' || theme === 'light') setTheme(theme)
  }, [settings.settings.theme, settings.settings.appearance, setTheme, setAppearance])

  const meta = SECTION_META[current]

  return (
    <div className={styles.shell}>
      <SettingsSidebar
        current={current}
        query={query}
        onQueryChange={setQuery}
        onSelect={setCurrent}
        onBack={closeSettings}
      />

      <div className={styles.content}>
        <div className={styles.dragZone} data-tauri-drag-region />
        <div className={styles.inner}>
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>{meta.label}</h1>
              {meta.subtitle && <p className={styles.subtitle}>{meta.subtitle}</p>}
            </div>
            {(settings.saving || settings.saved) && (
              <span className={styles.saveStatus} role="status" aria-live="polite">
                {settings.saving ? (
                  <>
                    <Spinner size={12} ariaLabel="正在保存" /> 保存中
                  </>
                ) : (
                  <>
                    <Check size={13} /> 已自动保存
                  </>
                )}
              </span>
            )}
          </header>

          {settings.error && <p className={styles.error}>{settings.error}</p>}

          {/* key 随分区变化，让内容重新挂载并播放淡入 */}
          <div key={current} className={styles.section}>
            <SectionContent id={current} settings={settings} />
          </div>
        </div>
      </div>
    </div>
  )
}
