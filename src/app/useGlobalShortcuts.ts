import { useEffect } from 'react'
import { useAppStore } from '@/store/app.store'
import { requestStop } from '@/store/chat'

type AppStore = ReturnType<typeof useAppStore.getState>

/** ⌘ 组合键到动作的映射，与设置页「键盘快捷键」分区展示的列表保持一致 */
const META_ACTIONS: Record<string, (store: AppStore) => void> = {
  k: (store) => store.setPaletteOpen(!store.paletteOpen),
  ',': (store) => store.openSettings(),
  n: (store) => store.startNewSession(),
  b: (store) => store.toggleSidebar(),
  '\\': (store) => store.toggleRightPanel(),
  t: (store) => store.toggleTerminal(),
  p: (store) => store.openRightPanelView('files'),
  /*
   * 重载窗口。浏览器自带这个键，Tauri 的 WKWebView 不带——
   * 于是页面可以连开几天，攒下几十次 HMR 补丁后进入与新代码不一致的状态
   * （典型表现是界面卡在某个中间态），而用户连"刷新一下"这个最基本的
   * 自救手段都没有，只能整个退出应用。
   */
  r: () => window.location.reload(),
}

/** 右侧面板「审阅」用 ⌃⇧G，与 Codex 一致，不走 ⌘ 那套 */
function handleControlShift(e: KeyboardEvent, store: AppStore): boolean {
  if (!e.ctrlKey || !e.shiftKey || e.metaKey || e.altKey) return false
  if (e.key.toLowerCase() !== 'g') return false
  store.openRightPanelView('review')
  return true
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const store = useAppStore.getState()

      /*
       * Esc 逐层退出；命令面板打开时由面板自行处理，不在这里抢。
       * 已被浮层（菜单、提及面板）用掉的 Esc 会标 defaultPrevented，同样不接——
       * 关个菜单不该顺手把运行也停了。
       */
      if (e.key === 'Escape' && !store.paletteOpen) {
        if (e.defaultPrevented) return
        if (store.settingsOpen) {
          store.closeSettings()
          return
        }
        requestStop()
        return
      }

      if (handleControlShift(e, store)) {
        e.preventDefault()
        return
      }

      if (!e.metaKey || e.altKey || e.ctrlKey) return

      const action = META_ACTIONS[e.key.toLowerCase()]
      if (!action) return

      e.preventDefault()
      action(store)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
