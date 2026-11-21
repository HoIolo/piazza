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
  accounts?: boolean
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

interface SlotEvent<T> {
  slotId: string
  payload: T
}

type Pending = {
  slotId: string
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * pi RPC 客户端（支持多槽位并发进程）。
 *
 * 前台会话绑定到 activeSlot；当流式中的会话被切走时，原槽位会退居后台继续跑，
 * 新会话在新的槽位启动。分帧与进程管理都在 Rust 侧按 slotId 隔离完成。
 */
class PiRpcClient<Event = AgentEvent, Command extends { type: string } = RpcCommand> {
  private activeSlot = 'default'
  private pending = new Map<string, Pending>()
  private eventListeners = new Set<(event: Event, slotId: string) => void>()
  private stderrListeners = new Set<(text: string, slotId: string) => void>()
  private exitListeners = new Set<(info: ExitInfo, slotId: string) => void>()
  private binding?: Promise<void>

  constructor(private readonly channel: Channel, private readonly timeout = COMMAND_TIMEOUT_MS) {}

  getActiveSlot = (): string => this.activeSlot
  setActiveSlot = (slotId: string): void => {
    this.activeSlot = slotId
  }

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
      const onMsg = listen<SlotEvent<RpcFrame>>(`${prefix}://message`, ({ payload }) =>
        this.dispatch(payload.payload, payload.slotId),
      )
      const onErr = listen<SlotEvent<string>>(`${prefix}://stderr`, ({ payload }) =>
        this.stderrListeners.forEach((cb) => cb(payload.payload, payload.slotId)),
      )
      const onExit = listen<SlotEvent<ExitInfo>>(`${prefix}://exit`, ({ payload }) => {
        this.rejectPendingForSlot(payload.slotId, new Error('pi 进程已退出'))
        this.exitListeners.forEach((cb) => cb(payload.payload, payload.slotId))
      })
      unlisteners.push(...(await Promise.all([onMsg, onErr, onExit])))
    } catch (reason) {
      unlisteners.forEach((off) => off())
      throw reason
    }
  }

  private dispatch(frame: RpcFrame, slotId: string): void {
    if (frame.type === 'response') {
      this.settle(frame as RpcResponse)
      return
    }
    this.eventListeners.forEach((cb) => cb(frame as Event, slotId))
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

  private rejectPendingForSlot(slotId: string, reason: Error): void {
    for (const [id, entry] of this.pending) {
      if (entry.slotId !== slotId) continue
      this.pending.delete(id)
      clearTimeout(entry.timer)
      entry.reject(reason)
    }
  }

  async start(options: StartOptions, slotId = this.activeSlot): Promise<void> {
    await this.bind()
    this.rejectPendingForSlot(slotId, new Error('会话正在切换'))
    const opts = {
      cwd: options.cwd,
      provider: options.provider ?? null,
      model: options.model ?? null,
      sessionPath: options.sessionPath ?? null,
      ephemeral: options.ephemeral ?? false,
    }
    await invoke('rpc_start', { opts, side: this.channel.side, accounts: this.channel.accounts, slotId })
  }

  /** 发送命令并等待其应答 */
  async send<T = unknown>(command: Command, slotId = this.activeSlot): Promise<T> {
    await this.bind()
    const id = crypto.randomUUID()
    const waiter = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`命令 ${command.type} 超时未响应`))
      }, this.timeout)
      this.pending.set(id, { slotId, resolve: resolve as (v: unknown) => void, reject, timer })
    })
    const delivery = this.notify({ ...command, id }, slotId).catch((reason: unknown) => {
      const entry = this.pending.get(id)
      if (!entry) return
      this.pending.delete(id)
      clearTimeout(entry.timer)
      entry.reject(reason instanceof Error ? reason : new Error(String(reason)))
    })
    const [result] = await Promise.all([waiter, delivery])
    return result
  }

  /**
   * 单向投递，不等待应答。
   *
   * 扩展 UI 的回应属于这一类：pi 收下就继续跑，不会回 response 帧，
   * 用 send() 发会一直挂到超时。
   */
  async notify(payload: Record<string, unknown>, slotId = this.activeSlot): Promise<void> {
    await invoke('rpc_send', { payload, side: this.channel.side, accounts: this.channel.accounts, slotId })
  }

  onEvent(cb: (event: Event, slotId: string) => void): () => void {
    return (this.eventListeners.add(cb), () => this.eventListeners.delete(cb))
  }

  onStderr(cb: (text: string, slotId: string) => void): () => void {
    return (this.stderrListeners.add(cb), () => this.stderrListeners.delete(cb))
  }

  onExit(cb: (info: ExitInfo, slotId: string) => void): () => void {
    return (this.exitListeners.add(cb), () => this.exitListeners.delete(cb))
  }

  async stop(slotId = this.activeSlot): Promise<void> {
    this.rejectPendingForSlot(slotId, new Error('会话已停止'))
    await invoke('rpc_stop', { side: this.channel.side, accounts: this.channel.accounts, slotId })
  }

  async isRunning(slotId = this.activeSlot): Promise<boolean> {
    return invoke<boolean>('rpc_is_running', { side: this.channel.side, accounts: this.channel.accounts, slotId })
  }
}

export { PiRpcClient }

export const rpcClient = new PiRpcClient(MAIN)

/** 侧边聊天专用：另一个 pi 进程，事件与主会话互不串线 */
export const sideRpcClient = new PiRpcClient(SIDE)
