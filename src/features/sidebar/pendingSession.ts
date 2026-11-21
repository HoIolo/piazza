import type { ProjectGroup, SessionMeta } from '@/shared/api/sessions'
import { userText } from '@/shared/utils/message'
import { useAppStore } from '@/store/app.store'
import { useChatStore } from '@/store/chat'

/** 已经在聊、但文件还没落盘的那条会话 */
export interface PendingSession {
  cwd: string
  path: string
  title: string
  startedMs: number
}

/**
 * 当前这条「还没落盘」的会话，全部由现有状态推出来。
 *
 * 不另存一份状态：pi 在 get_state 里报的会话文件，加上聊天区那条本地回显的
 * 用户消息，已经够拼出侧栏要显示的一行了。不存状态也就没有「什么时候清掉」
 * 的问题——换会话时这两个来源自己会变。
 */
export function usePendingSession(): PendingSession | null {
  const cwd = useAppStore((s) => s.currentCwd)
  const path = useAppStore((s) => s.liveSessionPath)
  // pi 的会话标题取自首条提问，这里跟它一致
  const first = useChatStore((s) => s.messages.find((m) => m.role === 'user'))

  if (!cwd || !path || first?.role !== 'user') return null
  return { cwd, path, title: userText(first), startedMs: first.timestamp }
}

/**
 * 把这条还没落盘的会话补进列表。
 *
 * pi 要等一轮跑完才把会话文件写到磁盘——实测用户消息落定时文件仍不存在，
 * agent_settled 之后才出现。所以从发出消息到回答结束这段时间里，扫描根本
 * 扫不到它，侧栏一直空着，像是这条消息掉进了黑洞。
 *
 * 下一轮扫描把真的那条带回来后按 path 撞上，占位行自然消失，不必专门清理。
 * 这一行只在侧栏合成，不写回 store：@提及那边挑会话是要真去打开文件的，
 * 给它一个还不存在的路径只会出错。
 */
export function withPendingSession(
  projects: ProjectGroup[],
  pending: PendingSession | null,
): ProjectGroup[] {
  if (!pending) return projects

  const owner = projects.find((p) => p.cwd === pending.cwd)
  if (owner?.sessions.some((s) => s.path === pending.path)) return projects

  const row: SessionMeta = {
    id: pending.path,
    path: pending.path,
    title: pending.title,
    timestamp: '',
    modifiedMs: pending.startedMs,
  }

  // 这个目录下还一条会话都没有，连项目分组也得现造
  if (!owner) {
    const group: ProjectGroup = {
      cwd: pending.cwd,
      name: projectName(pending.cwd),
      sessions: [row],
      latestMs: pending.startedMs,
    }
    return [group, ...projects]
  }

  // 放最前：它就是此刻正在聊的那条
  return projects.map((p) => (p === owner ? { ...p, sessions: [row, ...p.sessions] } : p))
}

/** 将多条尚未落盘的会话（前台 + 后台运行中）补进项目列表 */
export function withPendingSessions(
  projects: ProjectGroup[],
  pendingList: readonly (PendingSession | null)[],
): ProjectGroup[] {
  let result = projects
  for (const item of pendingList) {
    result = withPendingSession(result, item)
  }
  return result
}

/** 与 Rust 侧 project_name_of 一致：取路径最后一段 */
function projectName(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() ?? cwd
}
