import { Plus } from 'lucide-react'
import styles from './AttachMenu.module.css'

export interface AttachButtonProps {
  open: boolean
  onToggle: () => void
}

/**
 * 输入框左侧的「+」。只负责开关，面板本身由 Composer 统一渲染——
 * 它和 @ 唤起的是同一个面板、同一个位置，不该各自定位。
 */
export function AttachButton({ open, onToggle }: AttachButtonProps) {
  return (
    <button
      type="button"
      className={styles.trigger}
      data-open={open}
      onClick={onToggle}
      aria-label="添加内容"
      aria-haspopup="menu"
      aria-expanded={open}
    >
      <Plus size={19} />
    </button>
  )
}
