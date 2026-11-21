/**
 * 一条通道对应 Rust 侧的一个 pi 进程。事件名前缀需与 src-tauri/src/rpc.rs 的
 * MAIN / SIDE 保持一致；side 为真时命令发给侧边聊天那个 pi。
 */
export interface Channel {
  prefix: string
  side: boolean
  accounts?: boolean
}

export const MAIN: Channel = { prefix: 'pi', side: false }
export const SIDE: Channel = { prefix: 'pi-side', side: true }

/** 单条命令的等待上限。超时只拒绝该 Promise，不影响会话本身 */
export const COMMAND_TIMEOUT_MS = 60_000
