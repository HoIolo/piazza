import type { CSSProperties } from 'react'
import { trashSession } from '@/shared/api/sessions'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'
import {
  deriveSessionStatus,
  evictCachedSession,
  stopBackgroundSession,
  useBackgroundSessions,
  useChatStore,
} from '@/store/chat'
import { ProjectTree } from './components/ProjectTree'
import { ProjectTreeSkeleton } from './components/ProjectTreeSkeleton'
import { SidebarFooter } from './components/SidebarFooter'
import { SidebarHeader } from './components/SidebarHeader'
import { SidebarNav } from './components/SidebarNav'
import { addProject } from '@/shared/utils/addProject'
import { usePendingSession, withPendingSessions } from './pendingSession'
import { applyProjectOrder, byCreatedDesc } from './projectOrder'
import { useSidebarWidth } from './useSidebarWidth'
import styles from './Sidebar.module.css'

/** 左侧栏容器：只做组装与事件转接，具体渲染交给四个子组件 */
export function Sidebar() {
  const projects = useProjectsStore((s) => s.projects)
  const loading = useProjectsStore((s) => s.loading)
  const error = useProjectsStore((s) => s.error)
  const currentSessionPath = useAppStore((s) => s.currentSessionPath)
  const liveSessionPath = useAppStore((s) => s.liveSessionPath)
  const pinned = useAppStore((s) => s.pinnedProjects)
  const hiddenProjects = useAppStore((s) => s.hiddenProjects)
  const pinnedSessions = useAppStore((s) => s.pinnedSessions)
  const projectOrder = useAppStore((s) => s.projectOrder)
  const setProjectOrder = useAppStore((s) => s.setProjectOrder)
  const sessionOrder = useAppStore((s) => s.sessionOrder)
  const setSessionOrder = useAppStore((s) => s.setSessionOrder)
  const togglePinnedSession = useAppStore((s) => s.togglePinnedSession)
  const selectProject = useAppStore((s) => s.selectProject)
  const selectSession = useAppStore((s) => s.selectSession)
  const startNewSession = useAppStore((s) => s.startNewSession)
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const openSettings = useAppStore((s) => s.openSettings)
  const status = useChatStore((s) => deriveSessionStatus(s))
  const bgSessions = useBackgroundSessions()
  const bgStatusMap = new Map(bgSessions.map((bg) => [bg.path, bg.status]))
  const pending = usePendingSession()
  const resize = useSidebarWidth()

  /*
   * 隐藏的剔除、置顶的提前。
   *
   * 顺序完全归用户：拖过就按拖出来的排；没拖过按创建时间倒序（新的在上面）。
   * 都不参考「最近活跃」——否则每轮对话结束列表就自己重排，用户刚记住的
   * 位置又变了。置顶是显式操作，只在最后把置顶的整组提到前面，
   * 置顶区内部仍沿用上面算出来的顺序。
   */
  const visible = applyProjectOrder(
    withPendingSessions(projects, [...bgSessions, pending])
      .filter((p) => !hiddenProjects.includes(p.cwd))
      .sort(byCreatedDesc),
    projectOrder,
  ).sort((a, b) => Number(pinned.includes(b.cwd)) - Number(pinned.includes(a.cwd)))

  /*
   * 高亮以 pi 实际打开的那条为准，还不知道时才退回请求的那条。
   * 新会话请求时是 null，得等 pi 回报文件名才知道落在哪一条上。
   */
  const activeSessionPath = liveSessionPath ?? currentSessionPath

  const deleteSession = async (path: string) => {
    try {
      stopBackgroundSession(path)
      await trashSession(path)
      evictCachedSession(path)
      // 删的正是开着的这条：pi 还攥着那个文件，得先切到新会话，否则它下一轮又把文件写回来
      if (path === activeSessionPath) startNewSession()
      await useProjectsStore.getState().refresh()
    } catch (e) {
      useChatStore.getState().setError(`删除对话失败：${errorMessage(e)}`)
    }
  }

  const tree = (list: typeof visible) => (
    <ProjectTree
      projects={list}
      activeSessionPath={activeSessionPath}
      status={status}
      backgroundStatuses={bgStatusMap}
      pinnedProjects={pinned}
      pinnedSessions={pinnedSessions}
      sessionOrder={sessionOrder}
      onSelectProject={selectProject}
      onSelectSession={selectSession}
      onTogglePinSession={togglePinnedSession}
      onDeleteSession={(path) => void deleteSession(path)}
      onAddProject={() => void addProject()}
      onReorder={(order) => setProjectOrder(order)}
      onReorderSessions={(cwd, order) => setSessionOrder(cwd, order)}
    />
  )

  return (
    <aside
      className={styles.sidebar}
      data-open={sidebarOpen}
      data-dragging={resize.dragging}
      style={{ '--sidebar-w': `${resize.width}px` } as CSSProperties}
      inert={!sidebarOpen}
    >
      <SidebarHeader onSearch={() => setPaletteOpen(true)} onToggleSidebar={toggleSidebar} />
      <SidebarNav onNewChat={startNewSession} onOpenPackages={() => openSettings('packages')} />

      {/*
        有内容就先把树摆出来。列表现在每轮对话结束都会重扫，
        偶尔一次失败不该把好端端的树换成一行报错。
      */}
      {loading && visible.length === 0 ? (
        <ProjectTreeSkeleton />
      ) : (
        <>
          {/* 扫描失败也照样摆树：标题行右端的「添加项目」还得能用 */}
          {error && <div className={styles.hint}>读取会话失败：{error}</div>}
          {tree(visible)}
        </>
      )}

      <SidebarFooter onOpenSettings={() => openSettings()} />
      {sidebarOpen && <div className={styles.resize} {...resize.handle} />}
    </aside>
  )
}
