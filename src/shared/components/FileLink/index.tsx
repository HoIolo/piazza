import { useState } from 'react'
import { FileText } from 'lucide-react'
import { openLink } from '@/shared/utils/openLink'
import { useAppStore } from '@/store/app.store'
import styles from '../Markdown/Markdown.module.css'
import { FileLinkMenu } from './FileLinkMenu'
import { parseFileTarget, projectRelative } from './fileTarget'

export interface FileLinkProps {
  href: string
  cwd: string | null
  children: React.ReactNode
}

/**
 * 正文里指向本地文件的链接。
 *
 * Codex 的形态：蓝色文字 + 前置文件图标，左键在应用内打开，⌘/Ctrl+左键交给外部应用，
 * 右键给一组文件操作。这三件事各司其职：
 *   - 普通点击最常发生，应该留在应用内（右侧「文件」标签预览），不打断阅读；
 *   - 想用真正的编辑器改代码时才按 ⌘，那时才把焦点交给别的窗口；
 *   - 复制路径、复制内容这类不进菜单就没有入口，放右键。
 *
 * 项目外的文件（如 /Applications/Piazza.app）没法内嵌预览——后端只允许项目内相对路径，
 * 这类一律按「外部打开」处理，否则点了会得到一条报错。
 */
export function FileLink({ href, cwd, children }: FileLinkProps) {
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const target = parseFileTarget(href, cwd)

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const relative = projectRelative(target, cwd)
    if (relative === null || e.metaKey || e.ctrlKey) {
      void openLink(href, cwd)
      return
    }
    useAppStore.getState().openWorkspaceFile(relative)
  }

  return (
    <>
      <a
        href={href}
        className={styles.fileLink}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setMenuAt({ x: e.clientX, y: e.clientY })
        }}
      >
        <FileText size={14} className={styles.fileIcon} />
        {children}
      </a>
      {menuAt && <FileLinkMenu target={target} at={menuAt} onClose={() => setMenuAt(null)} />}
    </>
  )
}
