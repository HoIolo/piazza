/** 缩放上下限。下限让大图能整体缩进窗口，上限到像素级细看 */
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 8

/** 百分比下拉里的档位（按真实像素比标注，100% ＝ 原始像素） */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]

export const clampZoom = (value: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

/** 滚轮每一单位位移对应的缩放强度。触控板的捏合手势要细一档 */
export const WHEEL_INTENSITY = { wheel: 0.0022, pinch: 0.01 }

/**
 * 缩放锚点：放大时钉住鼠标下面的那一点。
 *
 * 只记「鼠标落在图片的哪个比例位置」和「鼠标在窗口里的坐标」，不记滚动量——
 * 缩放前图片可能居中、可能已经滚到别处，只有按图片自身的相对位置换算，
 * 缩放后才知道该把滚动条挪多少。
 */
export interface ZoomAnchor {
  /** 鼠标在图片内的相对位置，0~1 */
  fx: number
  fy: number
  /** 鼠标在窗口里的坐标 */
  clientX: number
  clientY: number
}

/** 量出鼠标此刻落在图片的哪个相对位置；量不到（图片还没尺寸）时返回 null */
export function anchorAt(
  image: HTMLElement | null,
  clientX: number,
  clientY: number,
): ZoomAnchor | null {
  const rect = image?.getBoundingClientRect()
  if (!rect || !rect.width || !rect.height) return null
  return {
    fx: (clientX - rect.left) / rect.width,
    fy: (clientY - rect.top) / rect.height,
    clientX,
    clientY,
  }
}

/**
 * 按锚点把滚动条挪回去，让缩放前鼠标下的那个点还在鼠标下。
 *
 * 必须在尺寸已经生效之后再算：缩放是改图片的 width/height，
 * 同一帧里读 getBoundingClientRect 拿到的还是旧尺寸，滚动会被夹到旧边界上。
 */
export function applyAnchor(
  stage: HTMLElement | null,
  image: HTMLElement | null,
  anchor: ZoomAnchor,
): void {
  const rect = image?.getBoundingClientRect()
  if (!stage || !rect) return
  stage.scrollLeft += rect.left + anchor.fx * rect.width - anchor.clientX
  stage.scrollTop += rect.top + anchor.fy * rect.height - anchor.clientY
}
