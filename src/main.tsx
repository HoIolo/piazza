import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { isMac } from '@/shared/utils/platform'
import './design/global.css'

// 平台标记由 index.html 的内联脚本先写好，这里只决定窗口底色让不让毛玻璃透上来。
// 毛玻璃只有 macOS 的 windowEffects 给得了；Windows 上是实色窗口底，让出来就成灰块。
if ('__TAURI_INTERNALS__' in window && isMac()) {
  document.documentElement.dataset.vibrancy = 'true'
}
if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = 'light'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
