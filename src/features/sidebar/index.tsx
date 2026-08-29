import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'
import { useChatStore } from '@/store/chat'
import { ProjectTree } from './components/ProjectTree'
import { ProjectTreeSkeleton } from './components/ProjectTreeSkeleton'
import { SidebarFooter } from './components/SidebarFooter'
import { SidebarHeader } from './components/SidebarHeader'
import { SidebarNav } from './components/SidebarNav'
import { usePendingSession, withPendingSession } from './pendingSession'
import styles from './Sidebar.module.css'

/** 左侧栏容器：只做组装与事件转接，具体渲染交给四个子组件 */
export function Sidebar() {
  const projects = useProjectsStore((s) => s.projects)
  const loading = useProjectsStore((s) => s.loading)
  const error = useProjectsStore((s) => s.error)
  const currentCwd = useAppStore((s) => s.currentCwd)
  const currentSessionPath = useAppStore((s) => s.currentSessionPath)
  const liveSessionPath = useAppStore((s) => s.liveSessionPath)
  const pinned = useAppStore((s) => s.pinnedProjects)
  const hiddenProjects = useAppStore((s) => s.hiddenProjects)
  const selectProject = useAppStore((s) => s.selectProject)
  const selectSession = useAppStore((s) => s.selectSession)
  const startNewSession = useAppStore((s) => s.startNewSession)
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen)
  const openSettings = useAppStore((s) => s.openSettings)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const awaitingInput = useChatStore((s) => s.pendingDialog !== null)

  // 隐藏的剔除、置顶的提前；其余保持后端按最近活跃排好的顺序
  const visible = withPendingSession(projects, usePendingSession())
    .filter((p) => !hiddenProjects.includes(p.cwd))
    .sort((a, b) => Number(pinned.includes(b.cwd)) - Number(pinned.includes(a.cwd)))

  /*
   * 高亮以 pi 实际打开的那条为准，还不知道时才退回请求的那条。
   * 新会话请求时是 null，得等 pi 回报文件名才知道落在哪一条上。
   */
  const activeSessionPath = liveSessionPath ?? currentSessionPath

  return (
    <aside className={styles.sidebar}>
      <SidebarHeader onSearch={() => setPaletteOpen(true)} />
      <SidebarNav onNewChat={startNewSession} onOpenPackages={() => openSettings('packages')} />

      {/*
        有内容就先把树摆出来。列表现在每轮对话结束都会重扫，
        偶尔一次失败不该把好端端的树换成一行报错。
      */}
      {loading ? (
        <ProjectTreeSkeleton />
      ) : visible.length > 0 ? (
        <ProjectTree
          projects={visible}
          currentCwd={currentCwd}
          activeSessionPath={activeSessionPath}
          running={isStreaming}
          awaitingInput={awaitingInput}
          onSelectProject={selectProject}
          onSelectSession={selectSession}
        />
      ) : error ? (
        <div className={styles.hint}>读取会话失败：{error}</div>
      ) : (
        <div className={styles.hint}>还没有会话记录</div>
      )}

      <SidebarFooter profileName="custom" onOpenSettings={() => openSettings()} />
    </aside>
  )
}
