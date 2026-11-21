import { CodexIcon } from './CodexIcon'
import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
  className?: string
}

/**
 * 界面自绘图标。
 *
 * 规格照 Codex 的图标：20×20 网格、1.33 线宽、圆头圆角，面板类图标是
 * 「圆角矩形 + 一道分隔线」。lucide 是 24 网格、2 线宽，缩到 17px 后线条
 * 仍比这套粗一档，几个摆在顶栏就显得笨——质感的差距主要出在这里。
 */
function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.33"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const FRAME = <rect x="3" y="4" width="14" height="12" rx="3" />

/** 侧栏开关：分隔线靠左 */
export function PanelLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {FRAME}
      <path d="M7.5 4v12" />
    </Svg>
  )
}

/** 右侧面板开关：分隔线靠右 */
export function PanelRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {FRAME}
      <path d="M12.5 4v12" />
    </Svg>
  )
}

/** 底部面板（终端）开关：分隔线靠下 */
export function PanelBottomIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {FRAME}
      <path d="M3 11.5h14" />
    </Svg>
  )
}

/** 环境信息：带工作区状态的清单 */
export function EnvIcon(props: IconProps) {
  return <CodexIcon {...props} name="summary" size={props.size ?? 20} />
}

/** 新对话：方框缺一角，一支笔斜插进来 */
export function ComposeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 4H6.5A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16h7a2.5 2.5 0 0 0 2.5-2.5v-3" />
      <path d="m9 11 .4-2.2 5.7-5.7a1.3 1.3 0 0 1 1.8 1.8l-5.7 5.7L9 11Z" />
    </Svg>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="9" r="5" />
      <path d="m13 13 3.5 3.5" />
    </Svg>
  )
}

/** Codex Electron 的 folder-open-light-16 路径。 */
export function FolderOpenIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.81201 2.14111C5.31747 2.14111 5.81045 2.30182 6.21924 2.59912L7.0708 3.21826C7.30005 3.38488 7.57645 3.4751 7.85986 3.4751H11.3862C12.0185 3.47519 12.5577 3.67493 12.9692 4.06592C13.3715 4.44819 13.6089 4.97208 13.73 5.54834C13.775 5.76276 13.8477 6.09034 13.9097 6.3667C13.9228 6.42529 13.9351 6.48156 13.9468 6.53369H14.1099C15.0509 6.53372 15.6585 7.52935 15.229 8.3667L13.2769 12.1724C12.8674 12.9703 12.0458 13.4731 11.1489 13.4731H3.49854C2.29874 13.473 1.42701 12.5184 1.37354 11.4487L1.36963 11.4497L0.72998 4.58154L0.727051 4.55713V4.53271C0.727297 3.2122 1.79813 2.14136 3.11865 2.14111H4.81201ZM5.16357 7.58447C4.67855 7.58458 4.23107 7.84608 3.99365 8.26904L2.56104 10.8218C2.15931 11.5382 2.67708 12.4222 3.49854 12.4224H11.1489C11.6519 12.4224 12.1135 12.1413 12.3433 11.6938L14.2954 7.88721C14.3662 7.74865 14.2655 7.58451 14.1099 7.58447H5.16357ZM3.11865 3.19189C2.38162 3.19214 1.78385 3.7863 1.77783 4.52197L2.22119 9.28076L3.07764 7.75537C3.50089 7.00132 4.29887 6.5338 5.16357 6.53369H12.8716C12.8128 6.27105 12.7458 5.96975 12.7026 5.76416C12.6101 5.32403 12.4475 5.01946 12.2456 4.82764C12.0532 4.64484 11.7843 4.52499 11.3862 4.5249H7.85986C7.35447 4.5249 6.86139 4.3651 6.45264 4.06787L5.60107 3.44775C5.37181 3.2811 5.09545 3.19189 4.81201 3.19189H3.11865Z"
      />
    </svg>
  )
}

export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h3.1a1.5 1.5 0 0 1 1.1.5l.9 1h5.9A1.5 1.5 0 0 1 17 8v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14V6.5Z" />
    </Svg>
  )
}

/** 扩展包：一个立方体 */
export function PackageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m10 3 6 3.3v7.4L10 17l-6-3.3V6.3L10 3Z" />
      <path d="m4.2 6.4 5.8 3.2 5.8-3.2M10 9.6V17" />
    </Svg>
  )
}

export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 10h.01M10 10h.01M15 10h.01" strokeWidth="2" />
    </Svg>
  )
}

/** 加号。侧栏「项目」标题行右侧的添加入口 */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 5v10M5 10h10" />
    </Svg>
  )
}

export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7.5 3.5h5l-.6 4.4 2.6 2.6v1.5h-9v-1.5l2.6-2.6-.6-4.4Z" />
      <path d="M10 12v4.5" />
    </Svg>
  )
}
