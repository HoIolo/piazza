import type { ThemePreset } from './types'

export const EXTRA_PRESETS: ThemePreset[] = [
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    tagline: '复古暖棕羊皮纸',
    light: {
      surface: '#fbf1c7', sidebar: '#f2e5bc', ink: '#3c3836', accent: '#d65d0e',
      diffAdd: '#79740e', diffDel: '#cc241d',
      syntax: { comment: '#928374', keyword: '#9d0006', literal: '#af3a03', string: '#79740e', variable: '#076678', attribute: '#b57614', name: '#427b58' },
    },
    dark: {
      surface: '#282828', sidebar: '#1d2021', ink: '#ebdbb2', accent: '#fe8019',
      diffAdd: '#b8bb26', diffDel: '#fb4934',
      syntax: { comment: '#928374', keyword: '#fb4934', literal: '#fe8019', string: '#b8bb26', variable: '#83a598', attribute: '#fabd2f', name: '#8ec07c' },
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    tagline: '极地冰川蓝灰',
    light: {
      surface: '#eceff4', sidebar: '#e5e9f0', ink: '#2e3440', accent: '#5e81ac',
      diffAdd: '#5b8a5a', diffDel: '#bf616a',
      syntax: { comment: '#6c7a96', keyword: '#5e81ac', literal: '#d08770', string: '#6c8c58', variable: '#81a1c1', attribute: '#b48ead', name: '#4c566a' },
    },
    dark: {
      surface: '#2e3440', sidebar: '#242933', ink: '#eceff4', accent: '#88c0d0',
      diffAdd: '#a3be8c', diffDel: '#bf616a',
      syntax: { comment: '#7b88a1', keyword: '#81a1c1', literal: '#d08770', string: '#a3be8c', variable: '#88c0d0', attribute: '#ebcb8b', name: '#8fbcbb' },
    },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    tagline: '经典科学护眼',
    light: {
      surface: '#fdf6e3', sidebar: '#eee8d5', ink: '#4c6168', accent: '#268bd2',
      diffAdd: '#859900', diffDel: '#dc322f',
      syntax: { comment: '#93a1a1', keyword: '#859900', literal: '#cb4b16', string: '#2aa198', variable: '#268bd2', attribute: '#b58900', name: '#6c71c4' },
    },
    dark: {
      surface: '#002b36', sidebar: '#073642', ink: '#93a1a1', accent: '#268bd2',
      diffAdd: '#859900', diffDel: '#dc322f',
      syntax: { comment: '#586e75', keyword: '#859900', literal: '#cb4b16', string: '#2aa198', variable: '#268bd2', attribute: '#b58900', name: '#6c71c4' },
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    tagline: '清爽开发者蓝',
    light: {
      surface: '#ffffff', sidebar: '#f6f8fa', ink: '#1f2328', accent: '#0969da',
      diffAdd: '#1a7f37', diffDel: '#cf222e',
      syntax: { comment: '#6e7781', keyword: '#cf222e', literal: '#0550ae', string: '#0a3069', variable: '#953800', attribute: '#8250df', name: '#116329' },
    },
    dark: {
      surface: '#0d1117', sidebar: '#010409', ink: '#e6edf3', accent: '#58a6ff',
      diffAdd: '#3fb950', diffDel: '#f85149',
      syntax: { comment: '#8b949e', keyword: '#ff7b72', literal: '#79c0ff', string: '#a5d6ff', variable: '#ffa657', attribute: '#d2a8ff', name: '#7ee787' },
    },
  },
  {
    id: 'linear',
    name: 'Linear',
    tagline: '极简高对比靛蓝',
    light: {
      surface: '#fafafa', sidebar: '#f2f3f5', ink: '#18181b', accent: '#5e6ad2',
      diffAdd: '#16a34a', diffDel: '#dc2626',
      syntax: { comment: '#71717a', keyword: '#6d28d9', literal: '#c2410c', string: '#15803d', variable: '#4338ca', attribute: '#a16207', name: '#1d4ed8' },
    },
    dark: {
      surface: '#111216', sidebar: '#0b0c0f', ink: '#e4e6eb', accent: '#7c86ff',
      diffAdd: '#4ade80', diffDel: '#f87171',
      syntax: { comment: '#73788a', keyword: '#a78bfa', literal: '#fb923c', string: '#4ade80', variable: '#818cf8', attribute: '#facc15', name: '#60a5fa' },
    },
  },
]
