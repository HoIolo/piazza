import { readProjectPrefs, writeProjectPrefs } from '@/shared/utils/projectPrefs'

/**
 * 侧栏的置顶与隐藏偏好。
 *
 * 单独一片而不是塞在 app.store 里：这几项都要写 localStorage，
 * 与主题、面板那些纯内存状态不是一回事，混在一起只会让 store 越铺越长。
 */
export interface ProjectPrefsState {
  /** 置顶的项目 cwd，侧栏据此把它们排到最前 */
  pinnedProjects: string[]
  /** 从侧栏隐藏的项目 cwd。只是不显示，不动任何会话文件 */
  hiddenProjects: string[]
  /** 置顶的会话文件路径，排在所属项目的最前 */
  pinnedSessions: string[]
}

export interface ProjectPrefsActions {
  togglePinnedProject: (cwd: string) => void
  hideProject: (cwd: string) => void
  /** 取消隐藏。重新添加一个曾被移除的项目时要走这一步，否则加了也看不见 */
  showProject: (cwd: string) => void
  togglePinnedSession: (path: string) => void
}

type Setter = (updater: (state: ProjectPrefsState) => Partial<ProjectPrefsState>) => void

const saved = readProjectPrefs()

export const projectPrefsInitialState: ProjectPrefsState = {
  pinnedProjects: saved.pinned,
  hiddenProjects: saved.hidden,
  pinnedSessions: saved.pinnedSessions,
}

/** 有则去掉，无则加上 */
function toggled(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((v) => v !== item) : [...list, item]
}

/** 把改动并进侧栏偏好并落盘，返回要写回 store 的那部分 */
function persistPrefs(
  state: ProjectPrefsState,
  patch: Partial<ProjectPrefsState>,
): Partial<ProjectPrefsState> {
  const next = { ...state, ...patch }
  writeProjectPrefs({
    pinned: next.pinnedProjects,
    hidden: next.hiddenProjects,
    pinnedSessions: next.pinnedSessions,
  })
  return patch
}

export function createProjectPrefsActions(set: Setter): ProjectPrefsActions {
  return {
    togglePinnedProject: (cwd) =>
      set((s) => persistPrefs(s, { pinnedProjects: toggled(s.pinnedProjects, cwd) })),

    hideProject: (cwd) =>
      set((s) =>
        s.hiddenProjects.includes(cwd)
          ? {}
          : persistPrefs(s, { hiddenProjects: [...s.hiddenProjects, cwd] }),
      ),

    showProject: (cwd) =>
      set((s) =>
        s.hiddenProjects.includes(cwd)
          ? persistPrefs(s, { hiddenProjects: s.hiddenProjects.filter((v) => v !== cwd) })
          : {},
      ),

    togglePinnedSession: (path) =>
      set((s) => persistPrefs(s, { pinnedSessions: toggled(s.pinnedSessions, path) })),
  }
}
