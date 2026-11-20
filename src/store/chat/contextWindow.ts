import { rpcClient } from '@/rpc/client'
import {
  readAppSettings,
  readModelsConfig,
  writeAppSettings,
  writeModelsConfig,
  type ModelsConfig,
  type PiSettings,
} from '@/shared/api/config'
import { errorMessage } from '@/shared/utils/error'
import { useAppStore } from '@/store/app.store'
import { useChatStore } from './store'

export const CONTEXT_WINDOW_CHOICES = [
  { label: '200k', value: 200_000 },
  { label: '500k', value: 500_000 },
  { label: '1M', value: 1_000_000 },
] as const

const COMPACT_RESERVE_RATIO = 0.2
const PRESET_VALUES: readonly number[] = CONTEXT_WINDOW_CHOICES.map((c) => c.value)

export function modelContextKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`
}

function isPreset(value: unknown): value is number {
  return typeof value === 'number' && PRESET_VALUES.includes(value)
}

function collectModelConfigWindows(modelsConfig: ModelsConfig | null): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [provider, cfg] of Object.entries(modelsConfig?.providers ?? {})) {
    for (const model of cfg.models ?? []) {
      if (isPreset(model.contextWindow)) {
        result[modelContextKey(provider, model.id)] = model.contextWindow
      }
    }
  }
  return result
}

/** 启动时合并 models.json 与 settings.json 中按模型保存的上下文窗口档位。 */
export function resolveModelContextWindows(
  settings: PiSettings | null,
  modelsConfig: ModelsConfig | null,
): Record<string, number> {
  const result = collectModelConfigWindows(modelsConfig)
  const saved = settings?.modelContextWindows
  if (typeof saved !== 'object' || saved === null) return result
  for (const [key, val] of Object.entries(saved as Record<string, unknown>)) {
    if (isPreset(val)) result[key] = val
  }
  return result
}

function patchProviderModels(
  config: ModelsConfig,
  provider: string,
  modelId: string,
  contextWindow: number,
): ModelsConfig | null {
  const entry = config.providers?.[provider]
  if (!entry) return null
  const list = entry.models ?? []
  const idx = list.findIndex((m) => m.id === modelId)
  const models =
    idx >= 0
      ? list.map((m, i) => (i === idx ? { ...m, contextWindow } : m))
      : [...list, { id: modelId, contextWindow }]
  return {
    ...config,
    providers: { ...config.providers, [provider]: { ...entry, models } },
  }
}

async function writeCompactionForWindow(
  contextWindow: number,
  modelKeyToSave?: string,
): Promise<void> {
  const settings = await readAppSettings()
  const prevCompaction =
    typeof settings.compaction === 'object' && settings.compaction !== null
      ? (settings.compaction as Record<string, unknown>)
      : {}
  const prevMap =
    typeof settings.modelContextWindows === 'object' && settings.modelContextWindows !== null
      ? (settings.modelContextWindows as Record<string, number>)
      : {}
  const reserveTokens = Math.round(contextWindow * COMPACT_RESERVE_RATIO)
  await writeAppSettings({
    compaction: { ...prevCompaction, enabled: true, reserveTokens },
    ...(modelKeyToSave ? { modelContextWindows: { ...prevMap, [modelKeyToSave]: contextWindow } } : {}),
  })
}

/** 切换模型后，按该模型保存的上下文窗口同步 80% 自动压缩预留。 */
export async function syncCompactionForModel(provider: string, modelId: string): Promise<void> {
  const saved = useAppStore.getState().modelContextWindows[modelContextKey(provider, modelId)]
  if (!saved) return
  try {
    await writeCompactionForWindow(saved)
    await rpcClient.send({ type: 'set_auto_compaction', enabled: true })
  } catch {
    // 后台同步失败不打断切模型主流程
  }
}

/**
 * 为当前模型保存上下文窗口档位（200k / 500k / 1M），同步按 80% 阈值写入自动压缩预留。
 */
export async function applyContextWindowPreset(contextWindow: number): Promise<void> {
  const store = useChatStore.getState()
  const session = store.session
  const model = session?.model
  if (!model) return

  const key = modelContextKey(model.provider, model.id)
  useAppStore.getState().setModelContextWindow(key, contextWindow)
  store.setSession({
    ...session,
    autoCompactionEnabled: true,
    model: { ...model, contextWindow },
  })

  try {
    await writeCompactionForWindow(contextWindow, key)
    const modelsConfig = await readModelsConfig()
    const patched = patchProviderModels(modelsConfig, model.provider, model.id, contextWindow)
    if (patched) await writeModelsConfig(patched)
    await rpcClient.send({ type: 'set_auto_compaction', enabled: true })
  } catch (error) {
    useChatStore.getState().setError(errorMessage(error))
  }
}
