import type { SectionId } from '../sections'
import type { useAppSettings } from '../hooks/useAppSettings'
import { AppearanceSection } from '../sections/AppearanceSection'
import { EnvironmentSection } from '../sections/EnvironmentSection'
import { GeneralSection } from '../sections/GeneralSection'
import { ModelsSection } from '../sections/ModelsSection'
import { PackagesSection } from '../sections/PackagesSection'
import { PermissionsSection } from '../sections/PermissionsSection'
import { SessionsSection } from '../sections/SessionsSection'
import { ShortcutsSection } from '../sections/ShortcutsSection'

export interface SectionContentProps {
  id: SectionId
  settings: ReturnType<typeof useAppSettings>
}

/** 分区分发器：只决定「渲染哪个分区」，不参与分区内部渲染 */
export function SectionContent({ id, settings }: SectionContentProps) {
  switch (id) {
    case 'general':
      return <GeneralSection settings={settings} />
    case 'appearance':
      return <AppearanceSection settings={settings} />
    case 'models':
      return <ModelsSection />
    case 'shortcuts':
      return <ShortcutsSection />
    case 'packages':
      return <PackagesSection settings={settings} />
    case 'permissions':
      return <PermissionsSection settings={settings} />
    case 'sessions':
      return <SessionsSection settings={settings} />
    case 'environment':
      return <EnvironmentSection settings={settings} />
  }
}
