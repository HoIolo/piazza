import { CORE_PRESETS } from './presetsCore'
import { EXTRA_PRESETS } from './presetsExtra'
import type { ThemePreset } from './types'

export {
  ACCENT_SWATCHES,
  DEFAULT_CUSTOMIZATION,
  type ThemeCustomization,
  type ThemeMode,
  type ThemePalette,
  type ThemePreset,
  type ThemePresetId,
  type ThemeSyntax,
} from './types'

export const THEME_PRESETS: ThemePreset[] = [...CORE_PRESETS, ...EXTRA_PRESETS]

export function findThemePreset(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0]
}
