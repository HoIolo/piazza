import { useEffect, useState } from 'react'
import { Spinner } from '@/design/primitives/Spinner'
import { useAppStore } from '@/store/app.store'
import { SectionContent } from './components/SectionContent'
import { SettingsSidebar } from './components/SettingsSidebar'
import { useAppSettings } from './hooks/useAppSettings'
import { SECTION_TITLES, type SectionId } from './sections'
import styles from './SettingsView.module.css'

function isSectionId(value: string | null): value is SectionId {
  return value !== null && value in SECTION_TITLES
}

export interface SettingsViewProps {
  /** 由外部指定的初始分区，如侧栏「扩展包」直达 packages */
  initialSection?: string | null
}

/** 设置视图。内嵌在主窗口里，覆盖三栏布局，而不是另开一个窗口 */
export function SettingsView({ initialSection }: SettingsViewProps) {
  const [current, setCurrent] = useState<SectionId>(
    isSectionId(initialSection ?? null) ? (initialSection as SectionId) : 'general',
  )
  const [query, setQuery] = useState('')
  const settings = useAppSettings()
  const setTheme = useAppStore((s) => s.setTheme)
  const closeSettings = useAppStore((s) => s.closeSettings)

  // 主题存在配置里，读到之后同步给界面
  useEffect(() => {
    const theme = settings.settings.theme
    if (theme === 'dark' || theme === 'light') setTheme(theme)
  }, [settings.settings.theme, setTheme])

  // 模型分区自带保存按钮，避免底部再出现一条重复的保存栏
  const showSaveBar = settings.dirty && current !== 'models'

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
          <h1 className={styles.title}>{SECTION_TITLES[current]}</h1>
          {settings.error && <p className={styles.error}>{settings.error}</p>}
          {/* key 随分区变化，让内容重新挂载并播放淡入 */}
          <div key={current} className={styles.section}>
            <SectionContent id={current} settings={settings} />
          </div>
        </div>

        {showSaveBar && (
          <div className={styles.saveBar}>
            <span className={styles.saveHint}>有未保存的更改</span>
            <button
              type="button"
              className={styles.saveButton}
              disabled={settings.saving}
              onClick={settings.save}
            >
              {settings.saving && <Spinner size={13} ariaLabel="正在保存" />}
              {settings.saving ? '保存中' : '保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
