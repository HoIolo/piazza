import { pickProjectDirectories } from '@/shared/api/projects'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useProjectsStore } from '@/store/projects.store'
import { useChatStore } from '@/store/chat'

/**
 * 添加项目：系统目录选择器选完，记进侧栏并直接切过去。
 *
 * 选完就切是 Codex 的行为，也是用户点「添加」的本意——马上在这个目录里开工，
 * 而不是先把它摆进列表再自己点一下。
 *
 * 放成独立函数而不是组件里的闭包：侧栏标题行的「+」和 ⌘O 是同一个动作，
 * 两处各写一遍选择目录、解除隐藏、切换项目的顺序，迟早会写出两个不一样的版本。
 */
export async function addProject(): Promise<void> {
  const picked = await pickProjectDirectories(useAppStore.getState().currentCwd ?? undefined).catch(
    (e: unknown) => {
      useChatStore.getState().setError(`选择目录失败：${errorMessage(e)}`)
      return []
    },
  )
  if (picked.length === 0) return

  // 曾经被「从列表移除」过的目录要先解除隐藏，否则加回来了也看不见
  for (const cwd of picked) useAppStore.getState().showProject(cwd)
  useProjectsStore.getState().addProjects(picked)
  useAppStore.getState().selectProject(picked[0])
}
