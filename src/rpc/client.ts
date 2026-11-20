import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { AgentEvent, RpcCommand, RpcFrame, RpcResponse } from './types'

/**
 * 一条通道对应 Rust 侧的一个 pi 进程。事件名前缀需与 src-tauri/src/rpc.rs 的
 * MAIN / SIDE 保持一致；side 为真时命令发给侧边聊天那个 pi。
 */
interface Channel {
  prefix: string
  side: boolean
}

const MAIN: Channel = { prefix: 'pi', side: false }
const SIDE: Channel = { prefix: 'pi-side', side: true }

/** 单条命令的等待上限。超时只拒绝该 Promise，不影响会话本身 */
const COMMAND_TIMEOUT_MS = 60_000

export interface StartOptions {
  cwd: string
  provider?: string
  model?: string
  sessionPath?: string
  /** 临时会话，不落会话文件 */
  ephemeral?: boolean
}

/** pi 退出时 Rust 侧带回的信息，字段需与 rpc.rs 的 ExitPayload 一致 */
export interface ExitInfo {
  /** 被信号杀死时没有退出码，故可能为 null */
  code: number | null
  /** 退出前最后一段 stderr，正常退出时为空 */
  stderr: string
}

type Pending = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * pi RPC 客户端。
 *
 * 分帧与进程管理都在 Rust 侧完成，这里只负责两件事：
 * 给命令挂 id 并等待对应应答；把 agent 事件广播给订阅者。
 */
class PiRpcClient {
  private pending = new Map<string, Pending>()
  private eventListeners = new Set<(event: AgentEvent) => void>()
  private stderrListeners = new Set<(text: string) => void>()
  private exitListeners = new Set<(info: ExitInfo) => void>()
  private binding?: Promise<void>

  constructor(private readonly channel: Channel) {}

  /** 绑定 Tauri 事件通道。重复调用无副作用 */
  bind(): Promise<void> {
    return (this.binding ??= this.bindEvents().catch((reason: unknown) => {
      this.binding = undefined
      throw reason
    }))
  }

  private async bindEvents(): Promise<void> {
    const { prefix } = this.channel
    const unlisteners: UnlistenFn[] = []
    try {
      unlisteners.push(
        await listen<RpcFrame>(`${prefix}://message`, ({ payload }) => this.dispatch(payload)),
      )
      unlisteners.push(
        await listen<string>(`${prefix}://stderr`, ({ payload }) => {
          this.stderrListeners.forEach((cb) => cb(payload))
        }),
      )
      unlisteners.push(
        await listen<ExitInfo>(`${prefix}://exit`, ({ payload }) => {
          this.rejectAllPending(new Error('pi 进程已退出'))
          this.exitListeners.forEach((cb) => cb(payload))
        }),
      )
    } catch (reason) {
      unlisteners.forEach((off) => off())
      throw reason
    }
  }

  private dispatch(frame: RpcFrame): void {
    if (frame.type === 'response') {
      this.settle(frame as RpcResponse)
      return
    }
    this.eventListeners.forEach((cb) => cb(frame as AgentEvent))
  }

  private settle(response: RpcResponse): void {
    if (!response.id) return
    const entry = this.pending.get(response.id)
    if (!entry) return

    this.pending.delete(response.id)
    clearTimeout(entry.timer)

    if (response.success) entry.resolve(response.data)
    else entry.reject(new Error(response.error ?? `命令 ${response.command} 执行失败`))
  }

  private rejectAllPending(reason: Error): void {
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer)
      entry.reject(reason)
    })
    this.pending.clear()
  }

  async start(options: StartOptions): Promise<void> {
    await this.bind()
    this.rejectAllPending(new Error('会话正在切换'))
    await invoke('rpc_start', {
      opts: {
        cwd: options.cwd,
        provider: options.provider ?? null,
        model: options.model ?? null,
        sessionPath: options.sessionPath ?? null,
        ephemeral: options.ephemeral ?? false,
      },
      side: this.channel.side,
    })
  }

  /** 发送命令并等待其应答 */
  async send<T = unknown>(command: RpcCommand): Promise<T> {
    const id = crypto.randomUUID()
    const payload = { ...command, id }

    const waiter = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`命令 ${command.type} 超时未响应`))
      }, COMMAND_TIMEOUT_MS)

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })
    })

    const delivery = this.notify(payload).catch((reason: unknown) => {
      const entry = this.pending.get(id)
      if (!entry) return
      this.pending.delete(id)
      clearTimeout(entry.timer)
      entry.reject(reason instanceof Error ? reason : new Error(String(reason)))
    })
    // 在等待投递的同时处理 waiter，避免关闭标签时产生无人处理的拒绝。
    const [result] = await Promise.all([waiter, delivery])
    return result
  }

  /**
   * 单向投递，不等待应答。
   *
   * 扩展 UI 的回应属于这一类：pi 收下就继续跑，不会回 response 帧，
   * 用 send() 发会一直挂到超时。
   */
  async notify(payload: Record<string, unknown>): Promise<void> {
    await invoke('rpc_send', { payload, side: this.channel.side })
  }

  onEvent(callback: (event: AgentEvent) => void): () => void {
    this.eventListeners.add(callback)
    return () => this.eventListeners.delete(callback)
  }

  onStderr(callback: (text: string) => void): () => void {
    this.stderrListeners.add(callback)
    return () => this.stderrListeners.delete(callback)
  }

  onExit(callback: (info: ExitInfo) => void): () => void {
    this.exitListeners.add(callback)
    return () => this.exitListeners.delete(callback)
  }

  async stop(): Promise<void> {
    this.rejectAllPending(new Error('会话已停止'))
    await invoke('rpc_stop', { side: this.channel.side })
  }

  async isRunning(): Promise<boolean> {
    return invoke<boolean>('rpc_is_running', { side: this.channel.side })
  }
}

export const rpcClient = new PiRpcClient(MAIN)

/** 侧边聊天专用：另一个 pi 进程，事件与主会话互不串线 */
export const sideRpcClient = new PiRpcClient(SIDE)
