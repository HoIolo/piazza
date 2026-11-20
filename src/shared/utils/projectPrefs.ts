/**
 * 界面自己的侧栏偏好（项目的置顶与隐藏、会话的置顶）。
 *
 * 存 localStorage 而不是 pi 的 settings.json：那是 pi 的运行配置，
 * 把纯界面状态写进去会污染用户手写的配置，也会让 pi 读到它不认识的键。
 */
const KEY = 'piazza.projectPrefs'
/** 改名前用的键。只为搬一次家而留，等老用户都启动过一次后可以删掉 */
const LEGACY_KEY = 'pi-codex.projectPrefs'

export interface ProjectPrefs {
  /** 置顶的项目 cwd，排在列表最前 */
  pinned: string[]
  /** 从列表隐藏的项目 cwd。只是不显示，不动任何会话文件 */
  hidden: string[]
  /** 置顶的会话文件路径，排在所属项目的最前 */
  pinnedSessions: string[]
}

const EMPTY: ProjectPrefs = { pinned: [], hidden: [], pinnedSessions: [] }

/** 只留字符串项。存储可能被手改过，不能假定里面的形状 */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
}

/**
 * 取原始值，顺带把旧键搬到新键。
 *
 * 应用改名换了键名，而用户的置顶与隐藏还存在旧键下——不搬这一次，
 * 改名当天所有人的侧栏排序都会凭空重置。
 */
function readRaw(): string | null {
  const current = localStorage.getItem(KEY)
  if (current !== null) return current

  const legacy = localStorage.getItem(LEGACY_KEY)
  if (legacy === null) return null

  try {
    localStorage.setItem(KEY, legacy)
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // 搬家写失败不该连累这次读取：值已经拿到手了，下次启动再搬一遍即可
  }
  return legacy
}

export function readProjectPrefs(): ProjectPrefs {
  try {
    const raw = readRaw()
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY
    const { pinned, hidden, pinnedSessions } = parsed as Partial<ProjectPrefs>
    return {
      pinned: strings(pinned),
      hidden: strings(hidden),
      pinnedSessions: strings(pinnedSessions),
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
