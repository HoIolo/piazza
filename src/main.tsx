import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { restoreCachedTheme } from './design/themes/applyTheme'
import { isMac } from '@/shared/utils/platform'
import './design/global.css'

if ('__TAURI_INTERNALS__' in window && isMac()) {
  document.documentElement.dataset.vibrancy = 'true'
}
restoreCachedTheme()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
