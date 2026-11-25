export type ThemeMode = 'light' | 'dark'

export type ThemePresetId =
  | 'default'
  | 'catppuccin'
  | 'tokyo-night'
  | 'everforest'
  | 'rose-pine'
  | 'gruvbox'
  | 'nord'
  | 'solarized'
  | 'github'
  | 'linear'

export interface ThemeSyntax {
  comment: string
  keyword: string
  literal: string
  string: string
  variable: string
  attribute: string
  name: string
}

export interface ThemePalette {
  surface: string
  sidebar: string
  ink: string
  accent: string
  diffAdd: string
  diffDel: string
  syntax: ThemeSyntax
}

export interface ThemePreset {
  id: ThemePresetId
  name: string
  tagline: string
  light: ThemePalette
  dark: ThemePalette
}

export interface ThemeCustomization {
  preset: ThemePresetId
  accent: string | null
  contrast: number
  customSurface: string | null
  customInk: string | null
  opaqueSidebar: boolean
}

export const DEFAULT_CUSTOMIZATION: ThemeCustomization = {
  preset: 'default',
  accent: null,
  contrast: 50,
  customSurface: null,
  customInk: null,
  opaqueSidebar: false,
}

export const ACCENT_SWATCHES: Array<{ label: string; value: string | null }> = [
  { label: '跟随主题', value: null },
  { label: '经典蓝', value: '#0285ff' },
  { label: '极光紫', value: '#8b5cf6' },
  { label: '翡翠绿', value: '#10b981' },
  { label: '琥珀橙', value: '#f97316' },
  { label: '玫瑰粉', value: '#ec4899' },
  { label: '绯红', value: '#ef4444' },
  { label: '石墨', value: '#52525b' },
]
