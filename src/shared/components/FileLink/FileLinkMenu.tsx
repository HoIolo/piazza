import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, ExternalLink, FileCode2, FolderSearch } from 'lucide-react'
import { MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { useFileActions } from './useFileActions'
import type { FileTarget } from './fileTarget'
import styles from './FileLinkMenu.module.css'

export interface FileLinkMenuProps {
  target: FileTarget
  /** 右键时的视口坐标 */
  at: { x: number; y: number }
  onClose: () => void
}

/** 菜单贴到窗口边缘时留出的空隙 */
const EDGE = 8

/**
 * 文件链接的右键菜单，对齐 Codex 的 markdown.fileReference 那一组。
 *
 * Codex 给六七项，其中「保存副本」「在 GitHub 打开」「在浏览器打开」依赖它自己的
 * 工作区与仓库模型，我们没有对应能力，摆上来就是死按钮。保留的都是真能执行的。
 *
 * 不套现成的 Popover：那个是「由触发器开关」的形状，触发器是组件自己的子元素；
 * 右键菜单没有常驻触发器，位置来自鼠标坐标，套进去反而要为它加一堆旁路。
 */
export function FileLinkMenu({ target, at, onClose }: FileLinkMenuProps) {
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [submenu, setSubmenu] = useState(false)
  const actions = useFileActions(target, onClose)

  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      top: Math.min(at.y, window.innerHeight - height - EDGE),
      left: Math.min(at.x, window.innerWidth - width - EDGE),
    })
  }, [at])

  useDismiss(panel, onClose)

  return createPortal(
    <div
      ref={panel}
      className={styles.panel}
      style={pos ?? { visibility: 'hidden' }}
      role="menu"
      data-placed={pos !== null}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem
        icon={<FileCode2 size={15} />}
        disabled={actions.missing}
        onClick={() => actions.openWith('')}
      >
        打开文件
      </MenuItem>
      {actions.apps.length > 0 && !actions.missing && (
        <div className={styles.submenuHost} onPointerEnter={() => setSubmenu(true)}>
          <MenuItem icon={<ExternalLink size={15} />} hint="›">
            用…打开
          </MenuItem>
          {submenu && (
            <div className={styles.submenu} role="menu">
              {actions.apps.map((app) => (
                <MenuItem key={app.path || 'default'} onClick={() => actions.openWith(app.path)}>
                  {app.name}
                </MenuItem>
              ))}
            </div>
          )}
        </div>
      )}
      <MenuSeparator />
      <MenuItem icon={<Copy size={15} />} onClick={actions.copyPath}>
        {actions.flash === 'path' ? '已复制路径' : '复制路径'}
      </MenuItem>
      {actions.kind === 'file' && (
        <MenuItem icon={<Copy size={15} />} onClick={actions.copyContents}>
          {actions.flash === 'contents' ? '已复制内容' : '复制文件内容'}
        </MenuItem>
      )}
      {!actions.missing && (
        <MenuItem icon={<FolderSearch size={15} />} onClick={actions.reveal}>
          在访达中显示
        </MenuItem>
      )}
    </div>,
    document.body,
  )
}

/** 点外面或按 Esc 收起 */
function useDismiss(panel: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [panel, onClose])
}
