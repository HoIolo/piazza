import { useEffect } from 'react'
import { readAppSettings } from '@/shared/api/config'
import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'

/**
 * 应用启动初始化：套用 pi 的主题设置，扫出会话列表，并在未选中项目时
 * 默认落到最近使用的那个（扫描结果已按最近活动排序）。
 */
export function useBootstrap(): void {
  const setTheme = useAppStore((s) => s.setTheme)
  const selectProject = useAppStore((s) => s.selectProject)

  useEffect(() => {
    void (async () => {
      const settings = await readAppSettings().catch(() => null)
      if (settings?.theme === 'dark' || settings?.theme === 'light') {
        setTheme(settings.theme)
      }

      /*
       * 无条件扫一次，哪怕已经选好了项目——侧栏、@提及、项目选择器
       * 三处都只从 store 读，这里是它们唯一的首次填充。
       * 先扫再判断，别把扫描挡在 early return 后面。
       */
      const projects = await useProjectsStore.getState().refresh()
      if (useAppStore.getState().currentCwd) return
      if (projects.length > 0) selectProject(projects[0].cwd)
    })()
  }, [setTheme, selectProject])
}
