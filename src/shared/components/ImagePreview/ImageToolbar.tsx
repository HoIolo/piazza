import { ChevronDown, Download, X } from 'lucide-react'
import { MenuItem } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { ZOOM_STEPS } from './useImageZoom'
import styles from './ImagePreview.module.css'

const percentLabel = (value: number) => `${Math.round(value * 100)}%`

export interface ImageToolbarProps {
  /** 真实像素比，1 表示 1:1 */
  percent: number
  /** 适配倍数，用来把档位的像素比换算回去 */
  zoom: number
  src: string
  alt: string
  onFit: () => void
  onZoomTo: (fitZoom: number) => void
  onClose: () => void
}

/**
 * 查看器右上角那排浮动控件：百分比下拉、下载、关闭。
 *
 * 档位按真实像素比标注（100% ＝ 原始像素），与 Codex 一致；
 * 而内部记的是「适配倍数」，所以点档位时要除回当前的比例。
 */
export function ImageToolbar({
  percent,
  zoom,
  src,
  alt,
  onFit,
  onZoomTo,
  onClose,
}: ImageToolbarProps) {
  const fitScale = percent / zoom || 1

  return (
    <div className={styles.tools}>
      <Popover
        side="bottom"
        align="end"
        maxHeight={340}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className={styles.zoomTrigger}
            data-open={open}
            aria-label={`缩放比例，当前 ${percentLabel(percent)}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggle}
          >
            {percentLabel(percent)}
            <ChevronDown size={13} className={styles.zoomChevron} data-open={open} />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              selected={Math.abs(percent - fitScale) < 0.005}
              onClick={() => {
                onFit()
                close()
              }}
            >
              适配窗口
            </MenuItem>
            {ZOOM_STEPS.map((step) => (
              <MenuItem
                key={step}
                selected={Math.abs(step - percent) < 0.005}
                onClick={() => {
                  onZoomTo(step / fitScale)
                  close()
                }}
              >
                {percentLabel(step)}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>

      <a
        href={src}
        download={alt}
        className={styles.iconButton}
        aria-label="保存图片"
        title="保存图片"
      >
        <Download size={16} />
      </a>

      <button
        type="button"
        className={styles.iconButton}
        aria-label="关闭图片预览"
        title="关闭（Esc）"
        onClick={onClose}
      >
        <X size={17} />
      </button>
    </div>
  )
}
