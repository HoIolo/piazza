/**
 * 界面自己的侧栏偏好（项目的置顶与隐藏、会话的置顶、手动添加的项目）。
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
  /**
   * 手动添加过的项目根目录，按添加时间从新到旧。
   *
   * 侧栏本来是扫会话扫出来的，一个还没有任何会话的目录根本不会出现。
   * 用户点了「添加项目」却看不见它，等于这个按钮没生效，所以在这里记一份。
   */
  known: string[]
  /**
   * 用户手动拖出来的项目顺序（cwd 列表）。
   *
   * 有它就不再按创建时间排：拖过一次之后，列表顺序归用户所有。
   * 新出现的项目（拖完才添加的）追加在末尾，而不是插到最前面把它顶掉。
   */
  order: string[]
  /**
   * 用户手动拖出来的会话顺序，按所属项目分组：`{ [项目 cwd]: 会话文件路径[] }`。
   *
   * 与 order 分开存是因为会话天生属于某个项目，平铺成一份列表既分不清
   * 归属，也会在同一个会话出现在两个项目里时打架。
   */
  sessionOrder: Record<string, string[]>
}

const EMPTY: ProjectPrefs = {
  pinned: [],
  hidden: [],
  pinnedSessions: [],
  known: [],
  order: [],
  sessionOrder: {},
}

/** 只留字符串项。存储可能被手改过，不能假定里面的形状 */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
}

/** 同上，但要的是「项目 cwd → 路径数组」这张表 */
function pathGroups(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null) return {}
  const result: Record<string, string[]> = {}
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    const paths = strings(list)
    if (paths.length > 0) result[key] = paths
  }
  return result
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
    const { pinned, hidden, pinnedSessions, known, order, sessionOrder } =
      parsed as Partial<ProjectPrefs>
    return {
      pinned: strings(pinned),
      hidden: strings(hidden),
      pinnedSessions: strings(pinnedSessions),
      known: strings(known),
      order: strings(order),
      sessionOrder: pathGroups(sessionOrder),
    }
  } catch {
    // 存储损坏或不可用时退回空偏好，不该让侧栏因此打不开
    return EMPTY
  }
}

/**
 * 只写传进来的那几项，其余沿用盘上的值。
 *
 * 侧栏偏好被两个 store 各管一段（app.store 管置顶与隐藏，projects.store
 * 管手动添加的项目）。整份覆盖的话，后写的一方会把另一方刚存的东西抹掉。
 */
export function writeProjectPrefs(patch: Partial<ProjectPrefs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readProjectPrefs(), ...patch }))
  } catch {
    // 写失败只影响下次启动的排序，不值得打断当前操作
  }
}
