import { useState } from 'react'
import { reorderPaths } from '../projectOrder'

/** 拖动中的项目：被拖的 cwd 与当前落点 cwd */
export interface ProjectDragState {
  from: string
  over: string | null
}

/** 项目内拖动中的会话：所属项目、被拖的路径、当前落点路径 */
export interface SessionDragState {
  cwd: string
  from: string
  over: string | null
}

export interface ReorderHandlers {
  onReorder: (order: string[]) => void
  onReorderSessions: (cwd: string, order: string[]) => void
}

/**
 * 侧栏的两级拖动：项目之间换位，以及项目内部会话之间换位。
 *
 * 状态和落点计算放在这里，ProjectTree 只负责把它们接到行上——那段 JSX 本来
 * 就够长了，再塞进两套拖动的分支会读不懂。
 */
export function useSidebarDrag({ onReorder, onReorderSessions }: ReorderHandlers) {
  const [projectDrag, setProjectDrag] = useState<ProjectDragState | null>(null)
  const [sessionDrag, setSessionDrag] = useState<SessionDragState | null>(null)

  /*
   * 项目拖完：把 from 挪到 to 的位置并回报整份 cwd 顺序。
   *
   * 存整份顺序而不是「谁插到谁前面」：将来加了新项目也能算出它该落在哪，
   * 不必回放一串相对操作。
   */
  const dropProject = (cwds: string[], to: string) => {
    const from = projectDrag?.from
    setProjectDrag(null)
    if (!from || from === to) return
    const next = reorderPaths(cwds, from, to)
    if (next !== cwds) onReorder(next)
  }

  /*
   * 会话拖完：只回报「这个项目当前显示出来的那一段」。
   *
   * 用显示顺序而不是整份会话列表，是因为折叠时只露前几条——拿看不见的那些
   * 一起重排，用户会发现某些会话莫名挪了位置。
   *
   * cwd 必须与拖动来源一致：会话归属由它所在的项目决定，跨项目拖动没有意义
   * （移动文件是另一回事），放任它就会把目标项目的路径记到来源项目名下。
   */
  const dropSession = (cwd: string, visiblePaths: string[], to: string) => {
    const from = sessionDrag?.from
    const origin = sessionDrag?.cwd
    setSessionDrag(null)
    if (!from || !origin || origin !== cwd || from === to) return
    onReorderSessions(cwd, reorderPaths(visiblePaths, from, to))
  }

  return {
    projectDrag,
    setProjectDrag,
    sessionDrag,
    setSessionDrag,
    dropProject,
    dropSession,
  }
}
