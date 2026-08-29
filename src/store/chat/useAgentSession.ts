import { useEffect } from 'react'
import { rpcClient, type ExitInfo } from '@/rpc/client'
import type { AgentMessage, MessagesData, SessionState } from '@/rpc/types'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'
import { useChatStore } from './store'
import type { ChatError } from './types'

/**
 * 启动看门狗时限。
 *
 * 骨架屏本身没有任何出口：只要 bootSession 这个 Promise 不落地，界面就一直转，
 * 既没有原因也没有重试入口，用户只能重启应用。rpc_start 在 Rust 侧没有超时，
 * 所以这种「永远转圈」是能真实发生的，必须由前端兜住。
 */
const BOOT_TIMEOUT_MS = 20_000

/** 启动子进程并拉取会话状态与历史消息。打开已有会话才需要补历史，新会话为空 */
async function bootSession(
  cwd: string,
  sessionPath: string | null,
): Promise<{ state: SessionState; messages: AgentMessage[] }> {
  await rpcClient.start({ cwd, sessionPath: sessionPath ?? undefined })
  const state = await rpcClient.send<SessionState>({ type: 'get_state' })

  if (!sessionPath) return { state, messages: [] }

  const data = await rpcClient.send<MessagesData>({ type: 'get_messages' })
  return { state, messages: data.messages ?? [] }
}

/**
 * 把退出信息说成人话。
 *
 * 退出码单独看没有意义，得配合 stderr 才成立。实测 pi 在 stdin 断开时
 * 就是以 0 正常收摊、stderr 一个字都不写，所以「退出码 0」几乎总是
 * 连接被切断而不是它自己出了错——这一点必须写清楚，否则用户只会更困惑。
 */
function describeExit({ code, stderr }: ExitInfo): ChatError {
  const detail = stderr.trim() || undefined

  if (code === null) {
    return { message: 'pi 进程被终止', detail: detail ?? '进程被信号杀死。', fatal: true }
  }
  if (code === 0) {
    return {
      message: 'pi 进程已退出',
      detail: detail ?? '进程以退出码 0 正常结束，通常意味着与它的连接被切断。',
      fatal: true,
    }
  }
  return { message: `pi 进程异常退出（退出码 ${code}）`, detail, fatal: true }
}

/**
 * 订阅 agent 事件与进程退出。独立于会话切换，只在挂载时建立一次。
 */
function useAgentEvents(): void {
  useEffect(() => {
    const offEvent = rpcClient.onEvent((event) => {
      useChatStore.getState().applyEvent(event)
      /*
       * 一轮跑完再刷侧栏。
       *
       * 新会话的文件是 pi 在这一轮里才落盘的，早于此扫描根本扫不到——
       * 这正是「新建对话后左边一直看不到它」的原因。
       * 顺带让列表按最近活动重新排序，当前会话自然浮到最前。
       */
      if (event.type === 'agent_settled') void useProjectsStore.getState().refresh()
    })
    const offExit = rpcClient.onExit((info) => useChatStore.getState().setError(describeExit(info)))
    return () => {
      offEvent()
      offExit()
    }
  }, [])
}

/**
 * 管理 pi 会话的生命周期：随当前项目/会话变化启停子进程，
 * 并把 agent 事件接入 chat store。组件本身不直接触碰 RPC。
 */
export function useAgentSession(): void {
  const cwd = useAppStore((s) => s.currentCwd)
  const sessionPath = useAppStore((s) => s.currentSessionPath)
  const sessionNonce = useAppStore((s) => s.sessionNonce)

  useAgentEvents()

  useEffect(() => {
    if (!cwd) return

    // 切换过程中若用户又点了别的会话，丢弃这次的异步结果
    let cancelled = false
    const store = useChatStore.getState()
    store.reset()
    store.setSessionLoading(true)
    // 上一个会话的文件与这次无关，先摘掉，免得侧栏在启动期间还标着旧的那条
    useAppStore.getState().setLiveSession(null)

    // 超时不取消启动本身：它可能只是慢，晚点成功了照样把会话装上来
    const watchdog = setTimeout(() => {
      if (cancelled) return
      store.setSessionLoading(false)
      store.setError({
        message: '启动 pi 会话超时',
        detail: `等待 ${BOOT_TIMEOUT_MS / 1000} 秒仍未就绪。pi 可能没能启动，或启动后没有响应。`,
        fatal: true,
      })
    }, BOOT_TIMEOUT_MS)

    void bootSession(cwd, sessionPath)
      .then(({ state, messages }) => {
        if (cancelled) return
        store.setSession(state)
        store.setMessages(messages)
        // 新会话的文件名只有 pi 知道，接过来侧栏才标得出「当前在这一条」
        useAppStore.getState().setLiveSession(state.sessionFile ?? null)
        // 晚到但成功了，把超时提示撤掉，否则会跟正常的会话内容并存
        store.setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) store.setError(errorMessage(e))
      })
      .finally(() => {
        clearTimeout(watchdog)
        if (!cancelled) store.setSessionLoading(false)
      })

    return () => {
      cancelled = true
      clearTimeout(watchdog)
    }
  }, [cwd, sessionPath, sessionNonce])
}
