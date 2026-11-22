interface BrandMarkProps {
  size?: number
  className?: string
}

/**
 * 品牌标记：一道宽拱，拱下是终端提示符。
 *
 * 拱取自意大利广场四周的连拱廊——piazza 最标志性的建筑语汇，
 * 提示符则留住编码工具的身份。
 *
 * 拱必须**宽大于高、拱脚不落地**：并排比过四种拱形，窄而落地的那几种
 * 都会落进墓碑的轮廓里，灰色描边时尤其明显。宽而悬空的读作「通道」。
 */
export function BrandMark({ size = 56, className }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M9 52 L9 37 A23 23 0 0 1 55 37 L55 52"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
      <path
        d="M24 33 L30 39 L24 45"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M34 45 L41 45" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
    </svg>
  )
}
