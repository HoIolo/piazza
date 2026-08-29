/**
 * 扩展 UI 子协议。
 *
 * pi 的扩展通过 `ctx.ui.select()` 等方法向客户端要用户输入，RPC 模式下
 * 表现为 stdout 上的 extension_ui_request，客户端须以同 id 的
 * extension_ui_response 回应。这是 pi 里最接近 Codex「向用户提问」的能力。
 */

/** 需要用户回应的对话方法；其余（notify/setStatus 等）发完即忘 */
export type UiDialogMethod = 'select' | 'confirm' | 'input' | 'editor'

export interface UiRequestBase {
  type: 'extension_ui_request'
  id: string
  /** 超时后 pi 侧会自动以默认值兑现，客户端无需自己计时 */
  timeout?: number
  title?: string
  message?: string
}

export interface UiSelectRequest extends UiRequestBase {
  method: 'select'
  options: string[]
}

export interface UiConfirmRequest extends UiRequestBase {
  method: 'confirm'
}

export interface UiInputRequest extends UiRequestBase {
  method: 'input'
  placeholder?: string
}

export interface UiEditorRequest extends UiRequestBase {
  method: 'editor'
  prefill?: string
}

/** 发完即忘的方法，客户端可展示也可忽略 */
export interface UiNotifyRequest extends UiRequestBase {
  method: 'notify' | 'setStatus' | 'setWidget' | 'setTitle' | 'set_editor_text'
  notifyType?: 'info' | 'warning' | 'error'
}

export type ExtensionUiRequest =
  | UiSelectRequest
  | UiConfirmRequest
  | UiInputRequest
  | UiEditorRequest
  | UiNotifyRequest

/** 需要回应的对话请求 */
export type ExtensionUiDialog =
  | UiSelectRequest
  | UiConfirmRequest
  | UiInputRequest
  | UiEditorRequest

export function isDialogRequest(req: ExtensionUiRequest): req is ExtensionUiDialog {
  return (
    req.method === 'select' ||
    req.method === 'confirm' ||
    req.method === 'input' ||
    req.method === 'editor'
  )
}

export interface ExtensionUiResponse {
  type: 'extension_ui_response'
  id: string
  value?: string
  confirmed?: boolean
  cancelled?: boolean
}
