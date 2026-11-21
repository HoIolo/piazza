import { useEffect, type RefObject } from 'react'
import type { Question } from '@/shared/utils/questionnaire'
import { resolveKey, type KeyAction } from './keyAction'

export interface KeysOptions {
  rootRef: RefObject<HTMLDivElement | null>
  customRef: RefObject<HTMLTextAreaElement | null>
  question: Question
  cursor: number
  setCursor: (next: number) => void
  total: number
  index: number
  goTo: (next: number) => void
  pick: (label: string) => void
  onDismiss: () => void
  clearCustom: () => void
}

/** 把动作落到具体回调上；返回是否算「已处理」（用于 preventDefault） */
function runAction(action: KeyAction, options: KeysOptions): boolean {
  const { customRef, setCursor, goTo, pick, onDismiss, clearCustom } = options
  switch (action.kind) {
    case 'move':
      setCursor(action.cursor)
      return true
    case 'page':
      goTo(action.to)
      return true
    case 'pick':
      pick(action.label)
      return true
    case 'focus-custom':
      customRef.current?.focus()
      return true
    case 'dismiss':
      onDismiss()
      return true
    case 'clear-custom':
      clearCustom()
      setCursor(0)
      options.rootRef.current?.focus()
      return true
    default:
      return false
  }
}

/**
 * 面板键盘。挂在容器上而不是每个按钮上：焦点可能在自填框里，也可能是容器
 * 自己，一处监听才不会出现「焦点跑到别处快捷键就失灵」。
 *
 * 每次渲染都重挂监听，让回调拿到当轮的状态与 props——否则连按两次方向键
 * 时第二次仍会按上一轮的光标位置算，表现为「动一格就不动了」。
 */
export function useQuestionnaireKeys(options: KeysOptions) {
  useEffect(() => {
    const node = options.rootRef.current
    if (!node) return

    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveKey(event.key, {
        question: options.question,
        cursor: options.cursor,
        index: options.index,
        total: options.total,
        inCustom: event.target instanceof HTMLTextAreaElement,
      })
      if (action.kind !== 'ignore' && runAction(action, options)) event.preventDefault()
    }

    node.addEventListener('keydown', onKeyDown)
    return () => node.removeEventListener('keydown', onKeyDown)
  })
}
