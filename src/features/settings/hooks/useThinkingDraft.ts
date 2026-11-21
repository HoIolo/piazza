import { useState } from 'react'
import type { ModelConfig } from '@/shared/api/config'
import { matchThinkingPreset, type LevelMap } from '../thinkingPresets'

export interface ThinkingDraft {
  /** 界面上应展示的映射：未自定义时来自预设 */
  levelMap: LevelMap | undefined
  /** 用户是否已手动改过（改过就不再跟随预设） */
  customized: boolean
  setLevelMap: (map: LevelMap | undefined) => void
  /** 展开高级配置：把当前预设固化下来再让用户改 */
  customize: () => void
  /** 丢掉自定义，回到预设 */
  reset: () => void
  /** 保存时真正要写进文件的那份映射 */
  resolved: (draft: ModelConfig) => LevelMap | undefined
}

/**
 * 模型的思考强度映射。
 *
 * 默认跟随「模型 ID → 内置预设」，用户不被打扰；一旦手动改过就固定下来。
 * 保存时必须把最终映射落到文件：pi 只在 reasoning 为真时才读它，
 * 而界面上展示的是预设，用户点保存就应当得到这份预设。
 */
export function useThinkingDraft(
  models: ModelConfig[],
  index: number | null,
  draftId: string,
  patch: (fields: Partial<ModelConfig>) => void,
): ThinkingDraft {
  // 初始就有映射说明是用户自己写的，视为已自定义
  const [customized, setCustomized] = useState(
    () => index !== null && models[index].thinkingLevelMap !== undefined,
  )
  const [manual, setManual] = useState<LevelMap | undefined>(() =>
    index === null ? undefined : (models[index].thinkingLevelMap as LevelMap | undefined),
  )
  const presetMap = matchThinkingPreset(draftId)?.map
  const levelMap = customized ? manual : presetMap

  const setLevelMap = (map: LevelMap | undefined) => {
    setCustomized(true)
    setManual(map)
  }

  const customize = () => {
    // 固化当前预设，用户才能在它的基础上改
    setCustomized(true)
    setManual((prev) => prev ?? presetMap)
  }

  const reset = () => {
    setCustomized(false)
    setManual(undefined)
    patch({ thinkingLevelMap: undefined })
  }

  return {
    levelMap,
    customized,
    setLevelMap,
    customize,
    reset,
    resolved: (draft) => (customized ? manual : presetMap) ?? draft.thinkingLevelMap,
  }
}
