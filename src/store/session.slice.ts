export interface SessionState {
  /** 当前工作目录，即 pi 的 cwd */
  currentCwd: string | null
  /** 请求打开的会话文件，null 表示要开一个新会话 */
  currentSessionPath: string | null
  /**
   * pi 实际打开着的会话文件。
   *
   * 与 currentSessionPath 不是一回事：后者是「要开哪个」的请求，新会话时为 null；
   * 这个是「实际开了哪个」的事实，由 pi 的 get_state 回报。
   * 新会话的文件名只有 pi 知道，不接过来的话，侧栏永远没办法把它标成选中。
   */
  liveSessionPath: string | null
  /** 会话重开信号。pi 意外退出后、或要新开会话时自增，促使 useAgentSession 重新拉起进程 */
  sessionNonce: number
}

export interface SessionActions {
  selectProject: (cwd: string) => void
  selectSession: (cwd: string, sessionPath: string) => void
  startNewSession: () => void
  /** 记下 pi 报回来的会话文件，供侧栏标出当前会话 */
  setLiveSession: (path: string | null) => void
  /** 重新拉起 pi 会话，用于进程意外退出后的恢复 */
  reconnectSession: () => void
}

type Setter = (updater: (state: SessionState) => Partial<SessionState>) => void

export const sessionInitialState: SessionState = {
  currentCwd: null,
  currentSessionPath: null,
  liveSessionPath: null,
  sessionNonce: 0,
}

/**
 * 「开一个新会话」要改的字段。
 *
 * 必须连 sessionNonce 一起递增：新会话的 currentSessionPath 本来就是 null，
 * 若人已经身处一个新会话，再设一次 null 等于什么都没变，useAgentSession 的
 * 依赖不动，pi 也就不会重开——按钮点了跟没点一样。
 */
function newSession(s: SessionState): Partial<SessionState> {
  return { currentSessionPath: null, liveSessionPath: null, sessionNonce: s.sessionNonce + 1 }
}

export function createSessionActions(set: Setter): SessionActions {
  return {
    // 切换项目时清空会话选择，避免把上一个项目的会话带过来
    selectProject: (cwd) => set((s) => ({ ...newSession(s), currentCwd: cwd })),

    selectSession: (cwd, sessionPath) =>
      set((s) =>
        // 点的就是眼下开着的这条：重开一遍等于杀掉 pi 再原样拉起来，纯属白折腾
        s.currentCwd === cwd && s.liveSessionPath === sessionPath
          ? {}
          : { currentCwd: cwd, currentSessionPath: sessionPath, liveSessionPath: null },
      ),

    startNewSession: () => set(newSession),

    setLiveSession: (liveSessionPath) => set(() => ({ liveSessionPath })),

    reconnectSession: () => set((s) => ({ sessionNonce: s.sessionNonce + 1 })),
  }
}
