import { create } from 'zustand'
import { scanSessions, type ProjectGroup } from '@/shared/api/sessions'
import { normalizeProjectPath } from '@/shared/api/projects'
import { readProjectPrefs, writeProjectPrefs } from '@/shared/utils/projectPrefs'
import { basename } from '@/shared/utils/path'
import { errorMessage } from '@/shared/utils/error'

interface ProjectsStore {
  projects: ProjectGroup[]
  /** 用户手动添加、但还没有任何会话的项目根目录，按添加时间从新到旧 */
  knownProjects: string[]
  loading: boolean
  error: string | null
  /** 重新扫描 <agent>/sessions，返回最新列表 */
  refresh: () => Promise<ProjectGroup[]>
  /** 把手动添加的项目并进扫描结果，空目录因此也能出现在侧栏 */
  addProjects: (paths: string[]) => void
  /** 忘掉手动添加的项目。只清这条记忆，不动任何会话文件 */
  forgetProject: (cwd: string) => void
}

/*
 * 正在进行的那次扫描。放模块级而不是塞进 store：它只用于去重，
 * 没有任何组件需要因为它变化而重渲染。
 *
 * 去重是必需的——每轮对话结束都会刷一次，连着两轮结束就会叠在一起，
 * 各扫各的不只是白干，先发后到还会把新结果盖回成旧的。
 */
let inFlight: Promise<ProjectGroup[]> | null = null

/**
 * 手动添加的项目补进扫描结果。
 *
 * 扫出来的那部分原样保留——它带着会话，是真正的内容；手动添加的只是
 * 「这个目录也算一个项目」的声明，没有会话时给一个空分组。
 */
function mergeKnown(scanned: ProjectGroup[], known: string[]): ProjectGroup[] {
  const present = new Set(scanned.map((p) => p.cwd))
  const missing = known
    .filter((cwd) => !present.has(cwd))
    .map<ProjectGroup>((cwd) => ({
      cwd,
      name: basename(cwd) || cwd,
      sessions: [],
      // 没会话就没有活动时间。给 0 让它排在真有会话的项目之后，而不是混在最新里
      latestMs: 0,
    }))
  /*
   * 排在最前而不是最后：用户刚点完「添加」，列表有十几个项目时，
   * 把新目录埋在底部跟没加上没区别。等它有会话了自然回到扫描结果里排序。
   */
  return missing.length === 0 ? scanned : [...missing, ...scanned]
}

/**
 * 项目与会话列表。
 *
 * 放 store 而不是 hook：侧栏、@提及、项目选择器三处都要用，
 * 各自持一份 useState 的话，谁刷新就只有谁看得见——
 * 新建的会话迟迟不出现在侧栏，正是因为侧栏那份从挂载起就再没动过。
 */
export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  projects: [],
  knownProjects: readProjectPrefs().known,
  loading: true,
  error: null,

  refresh: () => {
    inFlight ??= scanSessions()
      .then((projects) => {
        set({ projects: mergeKnown(projects, get().knownProjects), error: null })
        return projects
      })
      .catch((e: unknown) => {
        // 只记错，不清空已有列表：一次失败不该把好端端的树抹掉
        set({ error: errorMessage(e) })
        return [] as ProjectGroup[]
      })
      .finally(() => {
        set({ loading: false })
        inFlight = null
      })
    return inFlight
  },

  addProjects: (paths) => {
    const added = paths.map(normalizeProjectPath).filter(Boolean)
    if (added.length === 0) return

    // 新加的排最前：刚点完就该在列表顶部看到它
    const knownProjects = [...added, ...get().knownProjects.filter((cwd) => !added.includes(cwd))]
    writeProjectPrefs({ known: knownProjects })

    // 已经在扫描结果里的目录不重复造分组，合并时按 cwd 去重
    set((s) => ({ knownProjects, projects: mergeKnown(s.projects, knownProjects) }))
  },

  forgetProject: (cwd) => {
    if (!get().knownProjects.includes(cwd)) return
    const knownProjects = get().knownProjects.filter((v) => v !== cwd)
    writeProjectPrefs({ known: knownProjects })
    set((s) => ({
      knownProjects,
      // 没有会话的空分组要一并消失；有会话的留在列表里，它本来就是扫出来的
      projects: s.projects.filter((p) => p.cwd !== cwd || p.sessions.length > 0),
    }))
  },
}))
