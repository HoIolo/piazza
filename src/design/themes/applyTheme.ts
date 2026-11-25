import { buildThemeTokens, isDefaultCustomization } from './buildTokens'
import { normalizeHex } from './colorMath'
import {
  DEFAULT_CUSTOMIZATION,
  THEME_PRESETS,
  type ThemeCustomization,
  type ThemeMode,
  type ThemePresetId,
} from './presets'

export { buildThemeTokens, isDefaultCustomization }

const CACHE_KEY = 'piazza.appearance'
const PRESET_IDS = new Set<string>(THEME_PRESETS.map((p) => p.id))

const MANAGED_VARS = [
  '--bg-canvas', '--bg-surface', '--bg-sidebar', '--bg-sidebar-vibrancy', '--bg-settings-sidebar',
  '--bg-hover', '--bg-selected', '--bg-sidebar-hover', '--bg-sidebar-selected',
  '--bg-code', '--bg-bubble', '--bg-input', '--bg-popover', '--bg-context-bar',
  '--border-subtle', '--border', '--border-strong', '--border-sidebar', '--border-outline',
  '--text-primary', '--text-secondary', '--text-tertiary', '--text-activity',
  '--sidebar-text', '--sidebar-muted', '--sidebar-row-highlight',
  '--blue-switch', '--blue-link', '--badge-input-bg', '--badge-input-text',
  '--diff-add', '--diff-del', '--text-error', '--send-btn', '--send-btn-disabled',
  '--composer-primary', '--composer-primary-text', '--text-on-dark',
  '--syntax-comment', '--syntax-keyword', '--syntax-literal', '--syntax-string',
  '--syntax-variable', '--syntax-attribute', '--syntax-name',
  '--skeleton-base', '--skeleton-shine',
] as const

export function normalizeCustomization(raw: unknown): ThemeCustomization {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CUSTOMIZATION }
  const obj = raw as Record<string, unknown>
  const preset = (
    typeof obj.preset === 'string' && PRESET_IDS.has(obj.preset) ? obj.preset : 'default'
  ) as ThemePresetId
  const contrastRaw = typeof obj.contrast === 'number' ? obj.contrast : 50
  return {
    preset,
    accent: normalizeHex(obj.accent),
    contrast: Math.max(25, Math.min(85, Math.round(contrastRaw))),
    customSurface: normalizeHex(obj.customSurface),
    customInk: normalizeHex(obj.customInk),
    opaqueSidebar: obj.opaqueSidebar === true,
  }
}

export function applyThemeToDocument(mode: ThemeMode, config: ThemeCustomization): void {
  const root = document.documentElement
  root.dataset.theme = mode
  const tokens = buildThemeTokens(mode, config)
  for (const key of MANAGED_VARS) {
    const val = tokens?.[key]
    if (val) root.style.setProperty(key, val)
    else root.style.removeProperty(key)
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ mode, config }))
  } catch {
    // 忽略受限存储
  }
}

export function restoreCachedTheme(): { mode: ThemeMode; config: ThemeCustomization } {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { mode?: unknown; config?: unknown }
      const mode: ThemeMode = parsed.mode === 'dark' ? 'dark' : 'light'
      const config = normalizeCustomization(parsed.config)
      applyThemeToDocument(mode, config)
      return { mode, config }
    }
  } catch {
    // 回退默认浅色
  }
  return { mode: 'light', config: { ...DEFAULT_CUSTOMIZATION } }
}
