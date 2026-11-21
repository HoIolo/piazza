import type { SectionId } from '../sections'
import type { AppSettingsHandle } from '../hooks/useAppSettings'
import { AppearanceSection } from '../sections/AppearanceSection'
import { InstructionsSection } from '../sections/InstructionsSection'
import { McpSection } from '../sections/McpSection'
import { ModelsSection } from '../sections/ModelsSection'
import { PackagesSection } from '../sections/PackagesSection'
import { ShortcutsSection } from '../sections/ShortcutsSection'
import { SkillsSection } from '../sections/SkillsSection'
import { SystemSection } from '../sections/SystemSection'

export interface SectionContentProps {
  id: SectionId
  settings: AppSettingsHandle
}

/** 分区分发器：只决定「渲染哪个分区」，不参与分区内部渲染 */
export function SectionContent({ id, settings }: SectionContentProps) {
  switch (id) {
    case 'appearance':
      return <AppearanceSection settings={settings} />
    case 'models':
      return <ModelsSection />
    case 'instructions':
      return <InstructionsSection />
    case 'skills':
      return <SkillsSection />
    case 'mcp':
      return <McpSection />
    case 'packages':
      return <PackagesSection settings={settings} />
    case 'shortcuts':
      return <ShortcutsSection />
    case 'system':
      return <SystemSection settings={settings} />
  }
}
