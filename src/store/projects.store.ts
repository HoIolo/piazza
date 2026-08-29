import { create } from 'zustand'
import { scanSessions, type ProjectGroup } from '@/shared/api/sessions'
import { errorMessage } from '@/shared/utils/error'

interface ProjectsStore {
  projects: ProjectGroup[]
  loading: boolean
  error: string | null
  /** 重新扫描 ~/.pi/agent/sessions，返回最新列表 */
  refresh: () => Promise<ProjectGroup[]>
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
 * 项目与会话列表。
 *
 * 放 store 而不是 hook：侧栏、@提及、项目选择器三处都要用，
 * 各自持一份 useState 的话，谁刷新就只有谁看得见——
 * 新建的会话迟迟不出现在侧栏，正是因为侧栏那份从挂载起就再没动过。
 */
export const useProjectsStore = create<ProjectsStore>((set) => ({
  projects: [],
  loading: true,
  error: null,

  refresh: () => {
    inFlight ??= scanSessions()
      .then((projects) => {
        set({ projects, error: null })
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
}))
