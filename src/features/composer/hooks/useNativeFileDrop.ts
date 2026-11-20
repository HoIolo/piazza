import { useEffect, type RefObject } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'

export function useNativeFileDrop(
  root: RefObject<HTMLElement | null>,
  onPaths: (paths: string[]) => void,
  onHover: (hover: boolean) => void,
) {
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (disposed) return
        if (payload.type === 'leave') {
          onHover(false)
          return
        }
        const inside = containsPoint(root.current?.getBoundingClientRect(), payload.position)
        onHover(inside && payload.type !== 'drop')
        if (inside && payload.type === 'drop') onPaths(payload.paths)
      })
      .then(
        (off) => {
          if (disposed) off()
          else unlisten = off
        },
        () => undefined,
      )
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [root, onPaths, onHover])
}

function containsPoint(bounds: DOMRect | undefined, position: { x: number; y: number }) {
  if (!bounds) return false
  const x = position.x / window.devicePixelRatio
  const y = position.y / window.devicePixelRatio
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom
}
