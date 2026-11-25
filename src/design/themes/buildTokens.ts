import { mixHex, readableOn, rgba } from './colorMath'
import {
  findThemePreset,
  type ThemeCustomization,
  type ThemeMode,
  type ThemePalette,
} from './presets'

interface ResolvedColors {
  isDark: boolean
  palette: ThemePalette
  surface: string
  elevated: string
  sidebar: string
  ink: string
  accent: string
  primaryBtn: string
  secAlpha: number
  triAlpha: number
  borderAlpha: number
  opaqueSidebar: boolean
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function resolveColors(mode: ThemeMode, config: ThemeCustomization): ResolvedColors {
  const palette = findThemePreset(config.preset)[mode]
  const isDark = mode === 'dark'
  const surface = config.customSurface ?? palette.surface
  const sidebar = config.customSurface
    ? mixHex(surface, '#000000', isDark ? 0.22 : 0.03)
    : palette.sidebar
  const ink = config.customInk ?? palette.ink
  const accent = config.accent ?? palette.accent
  const boost = (config.contrast - 50) / 100
  const elevated = isDark ? mixHex(surface, '#ffffff', 0.055) : surface
  return {
    isDark,
    palette,
    surface,
    elevated,
    sidebar,
    ink,
    accent,
    primaryBtn: config.accent ? accent : ink,
    secAlpha: clamp(0.72 + boost * 0.35, 0.55, 0.88),
    triAlpha: clamp(0.52 + boost * 0.35, 0.38, 0.72),
    borderAlpha: clamp((isDark ? 0.1 : 0.09) + boost * 0.2, 0.05, 0.24),
    opaqueSidebar: config.opaqueSidebar,
  }
}

function buildSurfaceVars(c: ResolvedColors): Record<string, string> {
  const vibrancy = c.opaqueSidebar ? c.sidebar : rgba(c.sidebar, c.isDark ? 0.8 : 0.74)
  const hoverAlpha = c.isDark ? 0.08 : 0.05
  const selectedAlpha = c.isDark ? 0.13 : 0.085
  return {
    '--bg-canvas': c.surface,
    '--bg-surface': c.elevated,
    '--bg-sidebar': c.sidebar,
    '--bg-sidebar-vibrancy': vibrancy,
    '--bg-settings-sidebar': c.sidebar,
    '--bg-hover': rgba(c.ink, hoverAlpha),
    '--bg-selected': rgba(c.ink, selectedAlpha),
    '--bg-sidebar-hover': rgba(c.ink, hoverAlpha),
    '--bg-sidebar-selected': rgba(c.ink, selectedAlpha),
    '--bg-code': mixHex(c.surface, c.ink, c.isDark ? 0.06 : 0.045),
    '--bg-bubble': rgba(c.ink, 0.055),
    '--bg-input': c.elevated,
    '--bg-popover': rgba(c.elevated, 0.96),
    '--bg-context-bar': mixHex(c.surface, c.sidebar, 0.65),
    '--border-subtle': rgba(c.ink, c.borderAlpha * 0.55),
    '--border': rgba(c.ink, c.borderAlpha),
    '--border-strong': rgba(c.ink, c.borderAlpha * 1.7),
    '--border-sidebar': c.isDark ? rgba('#000000', 0.42) : rgba(c.ink, c.borderAlpha),
    '--border-outline': rgba(c.ink, c.borderAlpha * 1.8),
  }
}

function buildForegroundVars(c: ResolvedColors): Record<string, string> {
  const linkTint = c.isDark ? '#ffffff' : '#000000'
  const btnText = readableOn(c.primaryBtn)
  const { syntax } = c.palette
  return {
    '--text-primary': c.ink,
    '--text-secondary': rgba(c.ink, c.secAlpha),
    '--text-tertiary': rgba(c.ink, c.triAlpha),
    '--text-activity': rgba(c.ink, c.triAlpha * 0.82),
    '--sidebar-text': c.ink,
    '--sidebar-muted': rgba(c.ink, c.triAlpha),
    '--sidebar-row-highlight': rgba(c.ink, c.isDark ? 0.1 : 0.08),
    '--blue-switch': c.accent,
    '--blue-link': mixHex(c.accent, linkTint, c.isDark ? 0.15 : 0.12),
    '--badge-input-bg': rgba(c.accent, c.isDark ? 0.22 : 0.12),
    '--badge-input-text': mixHex(c.accent, linkTint, c.isDark ? 0.35 : 0.15),
    '--diff-add': c.palette.diffAdd,
    '--diff-del': c.palette.diffDel,
    '--text-error': c.palette.diffDel,
    '--send-btn': c.primaryBtn,
    '--send-btn-disabled': mixHex(c.surface, c.ink, 0.22),
    '--composer-primary': c.primaryBtn,
    '--composer-primary-text': btnText,
    '--text-on-dark': btnText,
    '--syntax-comment': syntax.comment,
    '--syntax-keyword': syntax.keyword,
    '--syntax-literal': syntax.literal,
    '--syntax-string': syntax.string,
    '--syntax-variable': syntax.variable,
    '--syntax-attribute': syntax.attribute,
    '--syntax-name': syntax.name,
    '--skeleton-base': mixHex(c.surface, c.ink, 0.07),
    '--skeleton-shine': mixHex(c.surface, c.ink, 0.12),
  }
}

export function isDefaultCustomization(c: ThemeCustomization): boolean {
  return (
    c.preset === 'default' &&
    c.accent === null &&
    c.contrast === 50 &&
    c.customSurface === null &&
    c.customInk === null &&
    !c.opaqueSidebar
  )
}

/** 从预设 + 自定义颜色 + 对比度推导出完整的语义 CSS 变量集 */
export function buildThemeTokens(
  mode: ThemeMode,
  config: ThemeCustomization,
): Record<string, string> | null {
  if (isDefaultCustomization(config)) return null
  const resolved = resolveColors(mode, config)
  return { ...buildSurfaceVars(resolved), ...buildForegroundVars(resolved) }
}
