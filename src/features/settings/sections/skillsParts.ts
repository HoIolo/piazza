import { useEffect } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { deleteAgentSkill, listAgentSkills, type SkillRecord } from '@/shared/api/agentResources'
import { errorMessage } from '@/shared/utils/error'
import { refreshRuntimeAfterSave } from '@/store/chat/refreshRuntime'

/** 扫技能目录。抽出来只是为了让组件本体短一截 */
export function useSkillsLoad(
  cwd: string | null,
  nonce: number,
  setSkills: (v: SkillRecord[]) => void,
  setError: (v: string | null) => void,
  setLoading: (v: boolean) => void,
) {
  useEffect(() => {
    let cancelled = false
    listAgentSkills(cwd)
      .then((list) => {
        if (!cancelled) {
          setSkills(list)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cwd, nonce, setError, setLoading, setSkills])
}

/** 删除技能：先确认，再移进废纸篓，最后重启 pi 让工具列表跟上 */
export async function deleteSkill(
  skill: SkillRecord,
  cwd: string | null,
  onDeleted: () => void,
  setError: (v: string | null) => void,
) {
  const label = skill.isSymlink ? '移除软链接' : '移入废纸篓'
  const ok = await ask(`确定要${label}「${skill.name}」吗？`, {
    title: '删除技能',
    kind: 'warning',
    okLabel: '删除',
    cancelLabel: '取消',
  })
  if (!ok) return
  try {
    await deleteAgentSkill(skill.dirPath, cwd)
    refreshRuntimeAfterSave()
    onDeleted()
  } catch (e: unknown) {
    setError(errorMessage(e))
  }
}
