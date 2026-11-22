export type AppPlatform = 'macos' | 'windows' | 'linux'

/**
 * 当前平台。main.tsx 在第一帧之前就把结果写到 `<html data-os>`，
 * 启动完成后 useBootstrap 会用后端的 app_platform 覆盖成权威值。
 */
export function currentPlatform(): AppPlatform {
  const os = document.documentElement.dataset.os
  return os === 'windows' || os === 'linux' ? os : 'macos'
}

export const isMac = (): boolean => currentPlatform() === 'macos'

/**
 * 快捷键文案。macOS 是 ⌘K，Windows/Linux 是 Ctrl+K。
 *
 * 界面上只要写了键位就得走这里——把 ⌘ 硬编码进去，Windows 用户看到的
 * 全是按不出来的键，等同于没给快捷键。
 */
export function shortcut(key: string): string {
  return isMac() ? `⌘${key}` : `Ctrl+${key}`
}
