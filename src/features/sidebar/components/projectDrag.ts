import type { DragEvent } from 'react'

export interface ProjectDragProps {
  draggable?: boolean
  dragging?: boolean
  dropTarget?: boolean
  onDragStart?: () => void
  onDragOver?: () => void
  onDragEnd?: () => void
  onDrop?: () => void
}

/**
 * 把拖拽回调翻译成 DOM 事件属性。
 *
 * 单独抽出来是因为「不 preventDefault 就不会触发 drop」「拖动要带上 cwd」
 * 这些细节混在行渲染里，会把项目行那段 JSX 撑得读不懂。
 */
export function dragHandlers(cwd: string, props: ProjectDragProps) {
  if (!props.draggable) return {}
  const over = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    props.onDragOver?.()
  }
  return {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', cwd)
      props.onDragStart?.()
    },
    onDragOver: over,
    onDragEnd: () => props.onDragEnd?.(),
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      props.onDrop?.()
    },
  }
}
