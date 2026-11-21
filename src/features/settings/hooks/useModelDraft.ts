import { useState } from 'react'
import type { ModelConfig } from '@/shared/api/config'
import { CONTEXT_WINDOW_PRESETS } from '../constants'
import type { LevelMap } from '../thinkingPresets'
import { useThinkingDraft } from './useThinkingDraft'

/** 上下文窗口分段控件里「自定义」一档的值 */
export const CUSTOM_CONTEXT = 'custom'

/** 新模型直接给 200K：比让 pi 默默按 128K 算要明确 */
const NEW_MODEL: ModelConfig = { id: '', contextWindow: CONTEXT_WINDOW_PRESETS[0] }

function isPreset(value: number | undefined): boolean {
  return value !== undefined && CONTEXT_WINDOW_PRESETS.includes(value)
}

export interface ModelDraft {
  draft: ModelConfig
  patch: (fields: Partial<ModelConfig>) => void
  /** 思考强度映射，未自定义时来自匹配到的预设 */
  levelMap: LevelMap | undefined
  /** 用户是否已手动改过映射（改过就不再跟随预设） */
  customized: boolean
  setLevelMap: (map: LevelMap | undefined) => void
  /** 展开高级配置：把当前预设固化下来再让用户改 */
  customize: () => void
  /** 丢掉自定义，回到预设 */
  resetLevelMap: () => void
  /** 分段控件的当前值：预设档位的数字串，或「自定义」 */
  contextChoice: string
  pickContext: (choice: string) => void
  hasImage: boolean
  setImage: (on: boolean) => void
  /** 校验并整理出要写入的模型；不合法时给出原因 */
  finish: () => { model: ModelConfig } | { error: string }
}

/** 模型对话框的表单状态。index 为 null 是新建，否则编辑 models[index] */
export function useModelDraft(models: ModelConfig[], index: number | null): ModelDraft {
  const [draft, setDraft] = useState<ModelConfig>(index === null ? NEW_MODEL : models[index])
  // 现有值不在预设档位里（含没填）就停在「自定义」，数值原样保留
  const [custom, setCustom] = useState(index !== null && !isPreset(models[index].contextWindow))

  const patch = (fields: Partial<ModelConfig>) => setDraft((d) => ({ ...d, ...fields }))
  const thinking = useThinkingDraft(models, index, draft.id, patch)

  const pickContext = (choice: string) => {
    if (choice === CUSTOM_CONTEXT) {
      setCustom(true)
      return
    }
    setCustom(false)
    patch({ contextWindow: Number(choice) })
  }

  const finish = () => {
    const id = draft.id.trim()
    if (!id) return { error: '模型 ID 不能为空' }
    if (models.some((m, i) => i !== index && m.id === id)) return { error: `模型「${id}」已存在` }
    // 空名字不写进文件，显示时自然回落到 id
    const name = draft.name?.trim()
    const thinkingLevelMap = thinking.resolved(draft)
    return {
      model: {
        ...draft,
        id,
        name: name || undefined,
        ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
      },
    }
  }

  return {
    draft,
    patch,
    levelMap: thinking.levelMap,
    customized: thinking.customized,
    setLevelMap: thinking.setLevelMap,
    customize: thinking.customize,
    resetLevelMap: thinking.reset,
    contextChoice: custom ? CUSTOM_CONTEXT : String(draft.contextWindow),
    pickContext,
    hasImage: draft.input?.includes('image') ?? false,
    setImage: (on) => patch({ input: on ? ['text', 'image'] : ['text'] }),
    finish,
  }
}
