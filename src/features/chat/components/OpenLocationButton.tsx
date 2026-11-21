import { useEffect, useState } from 'react'
import { AppWindow, ChevronDown } from 'lucide-react'
import { FolderIcon } from '@/design/icons'
import { MenuItem } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { listExternalApps, openPathWith, type ExternalApp } from '@/shared/api/pi'
import styles from './OpenLocationButton.module.css'

export interface OpenLocationButtonProps {
  /** 要打开的目录 */
  target: string | null
}

/**
 * 「打开位置」。左半直接用上次选的应用打开，右半展开应用列表——
 * 与 Codex 的分体按钮一致，常用路径一次点击即可。
 */
export function OpenLocationButton({ target }: OpenLocationButtonProps) {
  const [apps, setApps] = useState<ExternalApp[]>([])
  const [preferred, setPreferred] = useState<ExternalApp | null>(null)

  useEffect(() => {
    let cancelled = false
    listExternalApps()
      .then((list) => {
        if (cancelled || list.length === 0) return
        setApps(list)
        // 默认选列表里第一个真正的编辑器，没有就退回访达
        setPreferred(list.find((a) => a.path !== '') ?? list[0])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const openWith = (app: ExternalApp) => {
    if (!target) return
    setPreferred(app)
    void openPathWith(app.path, target)
  }

  if (!target) return null

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.main}
        onClick={() => preferred && openWith(preferred)}
        disabled={!preferred}
        aria-label="打开位置"
        title={preferred ? `用 ${preferred.name} 打开位置` : '打开位置'}
      >
        <FolderIcon size={18} />
      </button>

      <Popover
        side="bottom"
        align="end"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            className={styles.caret}
            data-open={open}
            onClick={toggle}
            aria-label="选择打开方式"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <ChevronDown size={12} />
          </button>
        )}
      >
        {(close) => (
          <div className={styles.panel}>
            {apps.map((app) => (
              <MenuItem
                key={app.name}
                icon={
                  app.icon ? (
                    <img src={app.icon} alt="" className={styles.appIcon} />
                  ) : (
                    <AppWindow size={16} />
                  )
                }
                selected={app.name === preferred?.name}
                onClick={() => {
                  openWith(app)
                  close()
                }}
              >
                {app.name}
              </MenuItem>
            ))}
          </div>
        )}
      </Popover>
    </div>
  )
}
