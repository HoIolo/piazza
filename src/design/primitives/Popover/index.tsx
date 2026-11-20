import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_MAX_HEIGHT, usePopoverDismiss, usePopoverPlacement } from './place'
import styles from './Popover.module.css'

export interface PopoverProps {
  /** 触发元素，由调用方提供视觉；Popover 只接管开关 */
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode
  children: (close: () => void) => ReactNode
  /** 浮层相对触发器的对齐边与方向。方向只是首选，放不下会自动翻到另一侧 */
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  /** 附加到定位容器上的类名 */
  className?: string
  /** 浮层是否裁切并滚动超长内容，内容里嵌二级浮层时设为 visible */
  overflow?: 'auto' | 'visible'
  /** 附加到浮层本身的类名，用于改宽度、内边距这类外观 */
  panelClassName?: string
  /** 浮层最大高度上限（像素）；默认统一限制在 360px 以内防止长列表铺满屏幕 */
  maxHeight?: number
}

const NestCtx = createContext<(el: HTMLElement) => () => void>(() => () => undefined)

const cx = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base)

/** 轻量浮层：统一处理 portal、限高定位、外部点击关闭与 Esc 拦截。 */
export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'top',
  className,
  overflow = 'auto',
  panelClassName,
  maxHeight = DEFAULT_MAX_HEIGHT,
}: PopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const nested = useRef(new Set<HTMLElement>())
  const registerWithParent = useContext(NestCtx)
  const id = useId()
  const close = useCallback(() => setOpen(false), [])
  const placement = usePopoverPlacement(open, side, align, maxHeight, rootRef, panelRef)
  usePopoverDismiss(open, rootRef, panelRef, nested, close)

  const register = useCallback(
    (el: HTMLElement) => {
      nested.current.add(el)
      const undo = registerWithParent(el)
      return () => {
        nested.current.delete(el)
        undo()
      }
    },
    [registerWithParent],
  )

  useEffect(() => {
    const panel = panelRef.current
    return open && panel ? registerWithParent(panel) : undefined
  }, [open, registerWithParent])

  return (
    <div className={cx(styles.root, className)} ref={rootRef}>
      {trigger({ open, toggle: () => setOpen((v) => !v), id })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={cx(styles.panel, panelClassName)}
            data-align={align}
            data-side={placement ? placement.side : side}
            data-overflow={overflow}
            data-placed={placement !== null}
            style={placement?.style}
            id={id}
            role="menu"
          >
            <NestCtx.Provider value={register}>{children(close)}</NestCtx.Provider>
          </div>,
          document.body,
        )}
    </div>
  )
}
