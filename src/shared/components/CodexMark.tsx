interface CodexMarkProps {
  size?: number
  className?: string
}

/**
 * 空状态中央的标记：圆润多瓣轮廓内含终端提示符 `>_`。
 * 轮廓由 10 个等分点之间的外凸圆弧拼成——按截图形态重绘的几何近似，
 * 不使用原始品牌资源。
 */
export function CodexMark({ size = 56, className }: CodexMarkProps) {
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
        d="M32 10
           A7.2 7.2 0 0 1 44.93 14.20
           A7.2 7.2 0 0 1 52.92 25.20
           A7.2 7.2 0 0 1 52.92 38.80
           A7.2 7.2 0 0 1 44.93 49.80
           A7.2 7.2 0 0 1 32 54
           A7.2 7.2 0 0 1 19.07 49.80
           A7.2 7.2 0 0 1 11.08 38.80
           A7.2 7.2 0 0 1 11.08 25.20
           A7.2 7.2 0 0 1 19.07 14.20
           A7.2 7.2 0 0 1 32 10
           Z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M25.5 26.5 L32 32.5 L25.5 38.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M34.5 38.5 L41.5 38.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
