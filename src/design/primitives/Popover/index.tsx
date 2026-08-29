import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import styles from './Popover.module.css'

export interface PopoverProps {
  /** 触发元素，由调用方提供视觉；Popover 只接管开关 */
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode
  children: (close: () => void) => ReactNode
  /** 浮层相对触发器的对齐边与方向 */
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  /**
   * 附加到定位容器上的类名。
   * 默认容器是 inline-flex、宽度贴合触发器；触发器需要撑满父容器时用它放开。
   */
  className?: string
}

/**
 * 轻量浮层：只负责开关、外部点击关闭、Esc 关闭与定位，内容完全交给调用方。
 *
 * 下拉菜单在这个界面里有六七处，形态各异（带搜索、带分组、带勾选），
 * 把「视觉」留给调用方、只抽「行为」，比做一个大而全的 Menu 组件更不容易打架。
 */
export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'top',
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={className ? `${styles.root} ${className}` : styles.root} ref={rootRef}>
      {trigger({ open, toggle: () => setOpen((v) => !v), id })}
      {open && (
        <div className={styles.panel} data-align={align} data-side={side} id={id} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
