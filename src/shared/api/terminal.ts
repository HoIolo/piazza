import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/** 与 src-tauri/src/terminal.rs 的事件名保持一致 */
const EVT_OUTPUT = 'terminal://output'
const EVT_EXIT = 'terminal://exit'

export interface TerminalOutput {
  id: string
  /** base64 编码的原始字节 */
  data: string
}

export function openTerminal(
  id: string,
  cwd: string | null,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke<void>('terminal_open', { id, cwd, cols, rows })
}

export function writeTerminal(id: string, data: string): Promise<void> {
  return invoke<void>('terminal_write', { id, data })
}

export function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  return invoke<void>('terminal_resize', { id, cols, rows })
}

export function closeTerminal(id: string): Promise<void> {
  return invoke<void>('terminal_close', { id })
}

export function onTerminalOutput(handler: (payload: TerminalOutput) => void) {
  return listen<TerminalOutput>(EVT_OUTPUT, (e) => handler(e.payload))
}

export function onTerminalExit(handler: (id: string) => void) {
  return listen<{ id: string }>(EVT_EXIT, (e) => handler(e.payload.id))
}
