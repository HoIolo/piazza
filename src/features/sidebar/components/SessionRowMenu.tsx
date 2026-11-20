import { useState } from 'react'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { Copy, FolderSearch, Pin, PinOff, Trash2 } from 'lucide-react'
import { MoreIcon } from '@/design/icons'
import { MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import styles from './SessionRow.module.css'

export interface SessionRowMenuProps {
  path: string
  pinned: boolean
  onTogglePin: () => void
  onDelete: () => void
}

/**
 * 会话行的「…」菜单。
 *
 * Codex 这里还有「重命名」「归档」「标为未读」：pi 只能给**当前打开**的会话改名
 * （那个入口在顶栏标题上），也没有归档与未读的概念，摆上来就是死按钮，故不列。
 *
 * 删除要点两次——第一次只把这一项换成「确认删除」。会话是移进废纸篓而不是
 * 真删，但对用户来说它从列表里消失了，值得多确认一下。
 */
export function SessionRowMenu({ path, pinned, onTogglePin, onDelete }: SessionRowMenuProps) {
  const [confirming, setConfirming] = useState(false)

  return (
    <Popover
      side="bottom"
      align="end"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.action}
          data-open={open}
          onClick={(e) => {
            // 行本身是「打开这条会话」，点菜单不该顺带切过去
            e.stopPropagation()
            setConfirming(false)
            toggle()
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="会话菜单"
        >
          <MoreIcon size={18} />
        </button>
      )}
    >
      {(close) => (
        <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
          <MenuItem
            icon={pinned ? <PinOff size={16} /> : <Pin size={16} />}
            onClick={() => {
              onTogglePin()
              close()
            }}
          >
            {pinned ? '取消置顶' : '置顶对话'}
          </MenuItem>
          <MenuItem
            icon={<FolderSearch size={16} />}
            onClick={() => {
              void revealItemInDir(path).catch(() => undefined)
              close()
            }}
          >
            在访达中显示
          </MenuItem>
          <MenuItem
            icon={<Copy size={16} />}
            onClick={() => {
              void navigator.clipboard.writeText(path)
              close()
            }}
          >
            复制会话文件路径
          </MenuItem>

          <MenuSeparator />

          <MenuItem
            icon={<Trash2 size={16} />}
            tone="danger"
            onClick={() => {
              if (!confirming) return setConfirming(true)
              onDelete()
              close()
            }}
          >
            {confirming ? '确认删除（移到废纸篓）' : '删除对话'}
          </MenuItem>
        </div>
      )}
    </Popover>
  )
}
