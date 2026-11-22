import { checkForUpdate, installUpdate, relaunchApp, type Update } from '@/shared/api/updater'

export type UpdatePhase =
  | 'idle'
  /** 检查中 */
  | 'checking'
  /** 有新版本，等用户点 */
  | 'available'
  | 'downloading'
  /** 包已下载、正在装（Windows 会拉起安装程序） */
  | 'installing'
  /** 装完，等重启 */
  | 'ready'
  /** 已经是最新 */
  | 'uptodate'
  | 'error'

export interface UpdateInfo {
  version: string
  notes: string | null
  date: string | null
}

export interface UpdaterState {
  phase: UpdatePhase
  info: UpdateInfo | null
  /** 0..1；总长未知时为 null */
  progress: number | null
  error: string | null
  /** 更新弹窗是否展开 */
  dialogOpen: boolean
  /** 用户关过这次弹窗，同一次运行里不再自动弹 */
  dismissed: boolean
  /** 是否自动检查更新 */
  autoCheck: boolean
  check: (silent?: boolean) => Promise<void>
  download: () => Promise<void>
  restart: () => Promise<void>
  openDialog: () => void
  closeDialog: () => void
  setAutoCheck: (value: boolean) => void
}

export interface UpdaterActions {
  check: UpdaterState['check']
  download: UpdaterState['download']
  restart: UpdaterState['restart']
  openDialog: UpdaterState['openDialog']
  closeDialog: UpdaterState['closeDialog']
  setAutoCheck: UpdaterState['setAutoCheck']
}

const AUTO_KEY = 'piazza.autoUpdateCheck'
const LAST_KEY = 'piazza.lastUpdateCheckAt'
/** 自动检查的间隔。启动频繁时别每开一次窗口就请求一次 */
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000

/**
 * plugin-updater 返回的 Update 带方法，不适合塞进 React 状态里比对，
 * 放模块作用域：同一时刻只可能有一个人点「下载」。
 */
let pending: Update | null = null

export function readAutoCheck(): boolean {
  return localStorage.getItem(AUTO_KEY) !== '0'
}

/** 距上次自动检查是否已经超过间隔 */
export function shouldAutoCheck(now = Date.now()): boolean {
  if (!readAutoCheck()) return false
  const last = Number(localStorage.getItem(LAST_KEY) ?? 0)
  return !Number.isFinite(last) || now - last > CHECK_INTERVAL_MS
}

export const updaterInitialState: UpdaterState = {
  phase: 'idle',
  info: null,
  progress: null,
  error: null,
  dialogOpen: false,
  dismissed: false,
  autoCheck: readAutoCheck(),
  // 具体实现由 createUpdaterActions 覆盖
  check: async () => {},
  download: async () => {},
  restart: async () => {},
  openDialog: () => {},
  closeDialog: () => {},
  setAutoCheck: () => {},
}

type Setter = (updater: (state: UpdaterState) => Partial<UpdaterState>) => void

/** 静默检查只在真有更新时开口；失败也不打扰，启动时报错是纯噪音 */
async function runCheck(set: Setter, get: () => UpdaterState, silent: boolean): Promise<void> {
  const { phase } = get()
  if (phase === 'checking' || phase === 'downloading' || phase === 'installing') return
  localStorage.setItem(LAST_KEY, String(Date.now()))
  set(() => ({ phase: 'checking', error: null, dialogOpen: silent ? get().dialogOpen : true }))
  try {
    const update = await checkForUpdate()
    pending = update
    if (!update) {
      set(() => ({ phase: 'uptodate', info: null, dialogOpen: !silent }))
      return
    }
    set(() => ({
      phase: 'available',
      info: { version: update.version, notes: update.body ?? null, date: update.date ?? null },
      // 用户按过「稍后」就不再自动弹
      dialogOpen: !get().dismissed,
    }))
  } catch (error) {
    set(() => ({
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
      dialogOpen: !silent,
    }))
  }
}

async function runDownload(set: Setter): Promise<void> {
  if (!pending) return
  set(() => ({ phase: 'downloading', progress: 0, error: null }))
  try {
    await installUpdate(pending, ({ downloaded, total }) => {
      set(() => ({
        progress: total && total > 0 ? Math.min(downloaded / total, 1) : null,
        phase: 'downloading',
      }))
    })
    set(() => ({ phase: 'ready', progress: 1 }))
  } catch (error) {
    set(() => ({ phase: 'error', error: error instanceof Error ? error.message : String(error) }))
  }
}

export function createUpdaterActions(set: Setter, get: () => UpdaterState): UpdaterActions {
  return {
    check: (silent = false) => runCheck(set, get, silent),
    download: () => runDownload(set),
    restart: async () => {
      set(() => ({ phase: 'installing' }))
      await relaunchApp()
    },
    openDialog: () => set(() => ({ dialogOpen: true, dismissed: false })),
    closeDialog: () =>
      set(() => ({
        dialogOpen: false,
        // 只忽略「有新版本」这种待办状态；已下载完的提示下次还能叫出来
        dismissed: get().phase === 'available' ? true : get().dismissed,
      })),
    setAutoCheck: (value: boolean) => {
      localStorage.setItem(AUTO_KEY, value ? '1' : '0')
      set(() => ({ autoCheck: value }))
    },
  }
}
