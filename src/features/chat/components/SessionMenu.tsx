import { useState } from 'react'
import { Download, Ellipsis, FolderOpen, Pencil } from 'lucide-react'
import { IconButton } from '@/design/primitives/IconButton'
import { MenuItem } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { openPathWith } from '@/shared/api/pi'
import styles from './SessionMenu.module.css'

export interface SessionMenuProps {
  onRename: () => void
  onExport: () => Promise<string | null>
}

/** 会话标题右侧的「…」。只列 pi 真正支持的会话操作 */
export function SessionMenu({ onRename, onExport }: SessionMenuProps) {
  const [exported, setExported] = useState<string | null>(null)

  return (
    <Popover
      side="bottom"
      trigger={({ toggle, open }) => (
        <IconButton ariaLabel="更多操作" size="sm" active={open} onClick={toggle}>
          <Ellipsis size={16} />
        </IconButton>
      )}
    >
      {(close) => (
        <div className={styles.panel}>
          <MenuItem
            icon={<Pencil size={16} />}
            onClick={() => {
              onRename()
              close()
            }}
          >
            重命名会话
          </MenuItem>
          <MenuItem
            icon={<Download size={16} />}
            onClick={() => {
              void onExport().then(setExported)
            }}
          >
            导出为 HTML
          </MenuItem>

          {exported && (
            <button
              type="button"
              className={styles.exported}
              onClick={() => void openPathWith('', exported)}
            >
              <FolderOpen size={14} />
              已导出，点此打开
            </button>
          )}
        </div>
      )}
    </Popover>
  )
}
