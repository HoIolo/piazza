import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './design/global.css'

// 跑在 Tauri 里才有毛玻璃可透；标在 html 上，样式据此决定窗口底色要不要让出来
if ('__TAURI_INTERNALS__' in window) document.documentElement.dataset.vibrancy = 'true'
if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = 'light'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
