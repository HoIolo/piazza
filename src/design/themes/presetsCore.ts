import type { ThemePreset } from './types'

export const CORE_PRESETS: ThemePreset[] = [
  {
    id: 'default',
    name: 'Piazza 默认',
    tagline: '纯净中性灰阶',
    light: {
      surface: '#ffffff', sidebar: '#f9f9f9', ink: '#1a1c1f', accent: '#0285ff',
      diffAdd: '#00a240', diffDel: '#ba2623',
      syntax: { comment: '#4f4f4f', keyword: '#ab4f7a', literal: '#ac4f23', string: '#3a843f', variable: '#643cae', attribute: '#b8802b', name: '#1f4e94' },
    },
    dark: {
      surface: '#181818', sidebar: '#131313', ink: '#dfdfdf', accent: '#339cff',
      diffAdd: '#40c977', diffDel: '#fa423e',
      syntax: { comment: '#b9b9b9', keyword: '#f8a6c8', literal: '#f1a275', string: '#83d197', variable: '#b897f4', attribute: '#f9dc78', name: '#63a8f8' },
    },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    tagline: '柔和奶油与薰衣草',
    light: {
      surface: '#eff1f5', sidebar: '#e6e9ef', ink: '#4c4f69', accent: '#8839ef',
      diffAdd: '#40a02b', diffDel: '#d20f39',
      syntax: { comment: '#7c7f93', keyword: '#8839ef', literal: '#fe640b', string: '#40a02b', variable: '#1e66f5', attribute: '#df8e1d', name: '#179299' },
    },
    dark: {
      surface: '#1e1e2e', sidebar: '#181825', ink: '#cdd6f4', accent: '#cba6f7',
      diffAdd: '#a6e3a1', diffDel: '#f38ba8',
      syntax: { comment: '#7f849c', keyword: '#cba6f7', literal: '#fab387', string: '#a6e3a1', variable: '#89b4fa', attribute: '#f9e2af', name: '#94e2d5' },
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    tagline: '清冽霓虹蓝夜',
    light: {
      surface: '#e6e7ed', sidebar: '#d6d8df', ink: '#343b58', accent: '#2e7de9',
      diffAdd: '#387068', diffDel: '#c64343',
      syntax: { comment: '#848cb5', keyword: '#7847bd', literal: '#965027', string: '#485e30', variable: '#2e7de9', attribute: '#8c6c3e', name: '#0f4b6e' },
    },
    dark: {
      surface: '#1a1b26', sidebar: '#16161e', ink: '#c0caf5', accent: '#7aa2f7',
      diffAdd: '#9ece6a', diffDel: '#f7768e',
      syntax: { comment: '#565f89', keyword: '#bb9af7', literal: '#ff9e64', string: '#9ece6a', variable: '#7dcfff', attribute: '#e0af68', name: '#7aa2f7' },
    },
  },
  {
    id: 'everforest',
    name: 'Everforest',
    tagline: '暖绿森林护眼',
    light: {
      surface: '#fdf6e3', sidebar: '#f4f0d9', ink: '#5c6a72', accent: '#8da101',
      diffAdd: '#8da101', diffDel: '#f85552',
      syntax: { comment: '#939f91', keyword: '#f85552', literal: '#f57d26', string: '#8da101', variable: '#3a94c5', attribute: '#dfa000', name: '#35a77c' },
    },
    dark: {
      surface: '#2d353b', sidebar: '#232a2e', ink: '#d3c6aa', accent: '#a7c080',
      diffAdd: '#a7c080', diffDel: '#e67e80',
      syntax: { comment: '#859289', keyword: '#e67e80', literal: '#e69875', string: '#a7c080', variable: '#7fbbb3', attribute: '#dbbc7f', name: '#83c092' },
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    tagline: '低饱和玫瑰松木',
    light: {
      surface: '#faf4ed', sidebar: '#f2e9e1', ink: '#575279', accent: '#d7827e',
      diffAdd: '#286983', diffDel: '#b4637a',
      syntax: { comment: '#9893a5', keyword: '#286983', literal: '#ea9d34', string: '#56949f', variable: '#907aa9', attribute: '#d7827e', name: '#b4637a' },
    },
    dark: {
      surface: '#191724', sidebar: '#1f1d2e', ink: '#e0def4', accent: '#ebbcba',
      diffAdd: '#9ccfd8', diffDel: '#eb6f92',
      syntax: { comment: '#6e6a86', keyword: '#31748f', literal: '#f6c177', string: '#9ccfd8', variable: '#c4a7e7', attribute: '#ebbcba', name: '#eb6f92' },
    },
  },
]
