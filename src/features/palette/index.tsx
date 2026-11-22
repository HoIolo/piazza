import { useMemo } from 'react'
import { useAppStore } from '@/store/app.store'
import { PaletteContent } from './PaletteContent'
import type { PaletteItem } from './usePaletteItems'
import styles from './CommandPalette.module.css'
import { shortcut } from '@/shared/utils/platform'

/** ⌘K 命令面板，对应截图 4。这一层只管开关与遮罩 */
export function CommandPalette() {
  const open = useAppStore((s) => s.paletteOpen)
  const setOpen = useAppStore((s) => s.setPaletteOpen)
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel)
  const startNewSession = useAppStore((s) => s.startNewSession)
  const openSettings = useAppStore((s) => s.openSettings)

  const builtins = useMemo<PaletteItem[]>(
    () => [
      { id: 'settings', label: '设置', shortcut: shortcut(','), run: () => openSettings() },
      { id: 'new', label: '新建对话', shortcut: shortcut('N'), run: startNewSession },
      { id: 'panel', label: '切换右侧面板', shortcut: shortcut('\\'), run: toggleRightPanel },
    ],
    [openSettings, startNewSession, toggleRightPanel],
  )

  if (!open) return null

  return (
    <div className={styles.overlay} onMouseDown={() => setOpen(false)}>
      <PaletteContent builtins={builtins} onClose={() => setOpen(false)} />
    </div>
  )
}
