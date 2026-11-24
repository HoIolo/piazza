import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { subscribe, type Pending } from './pending'
import { COMMAND_TIMEOUT_MS, MAIN, SIDE, type Channel } from './channels'
import type { AgentEvent, RpcCommand, RpcFrame, RpcResponse } from './types'

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

  constructor(
    private readonly channel: Channel,
    private readonly timeout = COMMAND_TIMEOUT_MS,
  ) {}

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
        this.rejectPendingForSlot(payload.slotId, new Error('会话进程已退出'))
        this.exitListeners.forEach((cb) => cb(payload.payload, payload.slotId))
      })
      unlisteners.push(...(await Promise.all([onMsg, onErr, onExit])))
    } catch (reason) {
      unlisteners.forEach((off) => off())
      throw reason
    }
  }

  private dispatch(frame: RpcFrame, slotId: string): void {
    if (frame.type !== 'response') {
      this.eventListeners.forEach((cb) => cb(frame as Event, slotId))
      return
    }
    const response = frame as RpcResponse
    const entry = response.id ? this.pending.get(response.id) : undefined
    if (!entry) return
    this.pending.delete(response.id as string)
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
    // 缺省字段一律显式传 null：Rust 侧按 Option 解析，缺键与 null 不等价
    const opts = {
      cwd: options.cwd,
      provider: options.provider ?? null,
      model: options.model ?? null,
      sessionPath: options.sessionPath ?? null,
      ephemeral: options.ephemeral ?? false,
    }
    await invoke('rpc_start', { opts, ...this.target(slotId) })
  }

  /** 发送命令并等待其应答 */
  async send<T = unknown>(
    command: Command,
    slotId = this.activeSlot,
    timeoutMs = this.timeout,
  ): Promise<T> {
    await this.bind()
    const id = crypto.randomUUID()
    const waiter = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`命令 ${command.type} 超时未响应`))
      }, timeoutMs)
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

  /** 单向投递，不等待应答。扩展 UI 的回应属于这一类：pi 收下就继续跑，不回 response 帧 */
  async notify(payload: Record<string, unknown>, slotId = this.activeSlot): Promise<void> {
    await invoke('rpc_send', { payload, ...this.target(slotId) })
  }

  /** invoke 的公共参数：Rust 侧按 side/accounts/slotId 三元组定位进程 */
  private target(slotId: string) {
    const { side, accounts } = this.channel
    return { side, accounts, slotId }
  }

  onEvent(cb: (event: Event, slotId: string) => void): () => void {
    return subscribe(this.eventListeners, cb)
  }

  onStderr(cb: (text: string, slotId: string) => void): () => void {
    return subscribe(this.stderrListeners, cb)
  }

  onExit(cb: (info: ExitInfo, slotId: string) => void): () => void {
    return subscribe(this.exitListeners, cb)
  }

  async stop(slotId = this.activeSlot): Promise<void> {
    this.rejectPendingForSlot(slotId, new Error('会话已停止'))
    await invoke('rpc_stop', this.target(slotId))
  }

  async isRunning(slotId = this.activeSlot): Promise<boolean> {
    return invoke<boolean>('rpc_is_running', this.target(slotId))
  }
}

export { PiRpcClient }

export const rpcClient = new PiRpcClient(MAIN)

/** 侧边聊天专用：另一个 pi 进程，事件与主会话互不串线 */
export const sideRpcClient = new PiRpcClient(SIDE)
