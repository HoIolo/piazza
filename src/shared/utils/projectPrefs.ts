/**
 * 界面自己的项目偏好（置顶、隐藏）。
 *
 * 存 localStorage 而不是 pi 的 settings.json：那是 pi 的运行配置，
 * 把纯界面状态写进去会污染用户手写的配置，也会让 pi 读到它不认识的键。
 */
const KEY = 'pi-codex.projectPrefs'

export interface ProjectPrefs {
  /** 置顶的项目 cwd，排在列表最前 */
  pinned: string[]
  /** 从列表隐藏的项目 cwd。只是不显示，不动任何会话文件 */
  hidden: string[]
}

const EMPTY: ProjectPrefs = { pinned: [], hidden: [] }

export function readProjectPrefs(): ProjectPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY
    const { pinned, hidden } = parsed as Partial<ProjectPrefs>
    return {
      pinned: Array.isArray(pinned) ? pinned.filter((v) => typeof v === 'string') : [],
      hidden: Array.isArray(hidden) ? hidden.filter((v) => typeof v === 'string') : [],
    }
  } catch {
    // 存储损坏或不可用时退回空偏好，不该让侧栏因此打不开
    return EMPTY
  }
}

export function writeProjectPrefs(prefs: ProjectPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // 写失败只影响下次启动的排序，不值得打断当前操作
  }
}
