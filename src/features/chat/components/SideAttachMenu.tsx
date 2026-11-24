import { FileUp, FolderUp, MessageSquareQuote, Plus } from 'lucide-react'
import { MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import styles from './SideChat.module.css'

export function SideAttachMenu({
  hasParentMessages,
  onPickFile,
  onPickDir,
  onQuote,
}: {
  hasParentMessages: boolean
  onPickFile: () => void
  onPickDir: () => void
  onQuote: () => void
}) {
  return (
    <Popover
      align="start"
      side="top"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.quote}
          data-open={open}
          onClick={toggle}
          aria-label="添加内容"
          aria-haspopup="menu"
          aria-expanded={open}
          title="添加文件、图片或引用主对话"
        >
          <Plus size={18} />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={<FileUp size={15} />}
            onClick={() => {
              close()
              onPickFile()
            }}
          >
            添加文件或图片
          </MenuItem>
          <MenuItem
            icon={<FolderUp size={15} />}
            onClick={() => {
              close()
              onPickDir()
            }}
          >
            添加文件夹
          </MenuItem>
          {hasParentMessages && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={<MessageSquareQuote size={15} />}
                onClick={() => {
                  close()
                  onQuote()
                }}
              >
                引用主对话
              </MenuItem>
            </>
          )}
        </>
      )}
    </Popover>
  )
}
