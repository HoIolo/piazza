import { useEffect } from 'react'
import { readAppSettings, readModelsConfig } from '@/shared/api/config'
import { useAppStore } from '@/store/app.store'
import { resolveModelContextWindows } from '@/store/chat/contextWindow'
import { useProjectsStore } from '@/store/projects.store'

/**
 * 应用启动初始化：套用 pi 的主题与各模型上下文偏好，扫出会话列表，并在未选中项目时
 * 默认落到最近使用的那个（扫描结果已按最近活动排序）。
 */
export function useBootstrap(): void {
  const setTheme = useAppStore((s) => s.setTheme)
  const setModelContextWindows = useAppStore((s) => s.setModelContextWindows)
  const selectProject = useAppStore((s) => s.selectProject)

  useEffect(() => {
    const savedFont = localStorage.getItem('piazza.fontSize')
    if (savedFont === 'compact' || savedFont === 'large') {
      document.documentElement.dataset.fontSize = savedFont
    } else {
      delete document.documentElement.dataset.fontSize
    }
    void (async () => {
      const [settings, modelsConfig] = await Promise.all([
        readAppSettings().catch(() => null),
        readModelsConfig().catch(() => null),
      ])
      // 始终同步一次窗口主题（默认 light）：否则未配置 settings.theme 时，
      // macOS 夜间自动深色模式会把底层 NSVisualEffectView 毛玻璃切成深色
      setTheme(settings?.theme === 'dark' ? 'dark' : 'light')
      setModelContextWindows(resolveModelContextWindows(settings, modelsConfig))

      /*
       * 无条件扫一次，哪怕已经选好了项目——侧栏、@提及、项目选择器
       * 三处都只从 store 读，这里是它们唯一的首次填充。
       * 先扫再判断，别把扫描挡在 early return 后面。
       */
      const projects = await useProjectsStore.getState().refresh()
      if (useAppStore.getState().currentCwd) return
      if (projects.length > 0) selectProject(projects[0].cwd)
    })()
  }, [setTheme, setModelContextWindows, selectProject])
}
