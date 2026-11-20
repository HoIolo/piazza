import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react'

export function useModalDialog(close: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    const previous = document.activeElement
    element?.showModal()
    return () => {
      element?.close()
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])
  return {
    ref,
    onCancel: (event: SyntheticEvent) => {
      event.preventDefault()
      close()
    },
    onKeyDown: (event: KeyboardEvent<HTMLDialogElement>) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    },
  }
}
