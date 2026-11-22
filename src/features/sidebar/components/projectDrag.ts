import type { DragEvent } from 'react'

export interface DragProps {
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: () => void
  onDragEnd?: () => void
  onDrop?: () => void
}

/**
 * 把拖拽回调翻译成 DOM 事件属性。
 *
 * 单独抽出来是因为「不 preventDefault 就不会触发 drop」「拖动要带上被拖项的
 * 标识」这些细节混在行渲染里，会把项目行与会话行那两段 JSX 撑得读不懂。
 *
 * `payload` 是 dataTransfer 里带的东西（项目用 cwd，会话用文件路径）。
 * 本应用是同一窗口内拖动，靠上层的 state 认落点即可，dataTransfer 只为
 * 让浏览器认这是一次合法拖动。
 */
export function dragHandlers(payload: string, props: DragProps) {
  if (!props.draggable) return {}
  const over = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    props.onDragOver?.()
  }
  return {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', payload)
      props.onDragStart?.()
    },
    onDragOver: over,
    onDragEnd: () => props.onDragEnd?.(),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      props.onDrop?.()
    },
  }
}
