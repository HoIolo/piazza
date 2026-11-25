import type { ReactElement } from 'react'
import type { SectionId } from '../sections'
import type { AppSettingsHandle } from '../hooks/useAppSettings'
import { AboutSection } from '../sections/AboutSection'
import { AppearanceSection } from '../sections/AppearanceSection'
import { InstructionsSection } from '../sections/InstructionsSection'
import { McpSection } from '../sections/McpSection'
import { MemorySection } from '../sections/MemorySection'
import { ModelsSection } from '../sections/ModelsSection'
import { PackagesSection } from '../sections/PackagesSection'
import { ShortcutsSection } from '../sections/ShortcutsSection'
import { SkillsSection } from '../sections/SkillsSection'
import { SystemSection } from '../sections/SystemSection'

export interface SectionContentProps {
  id: SectionId
  settings: AppSettingsHandle
}

const SECTION_RENDERERS: Record<SectionId, (settings: AppSettingsHandle) => ReactElement> = {
  appearance: (settings) => <AppearanceSection settings={settings} />,
  models: () => <ModelsSection />,
  instructions: () => <InstructionsSection />,
  memory: (settings) => <MemorySection settings={settings} />,
  skills: () => <SkillsSection />,
  mcp: () => <McpSection />,
  packages: (settings) => <PackagesSection settings={settings} />,
  shortcuts: () => <ShortcutsSection />,
  system: (settings) => <SystemSection settings={settings} />,
  about: () => <AboutSection />,
}

/** 分区分发器：只决定「渲染哪个分区」，不参与分区内部渲染 */
export function SectionContent({ id, settings }: SectionContentProps) {
  return SECTION_RENDERERS[id](settings)
}
