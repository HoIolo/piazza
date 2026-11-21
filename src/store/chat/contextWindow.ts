import { rpcClient } from '@/rpc/client'
import { SYNC_CONTEXT_WINDOW_COMMAND } from '@/rpc/visibleCommands'
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
let syncQueue = Promise.resolve()

export function modelContextKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`
}

function isPreset(value: unknown): value is number {
  return typeof value === 'number' && PRESET_VALUES.includes(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
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
  for (const [key, val] of Object.entries(asRecord(settings?.modelContextWindows))) {
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
  const list = entry?.models ?? []
  const idx = list.findIndex((m) => m.id === modelId)
  if (!entry || idx < 0) return null
  const models = list.map((m, i) => (i === idx ? { ...m, contextWindow } : m))
  return {
    ...config,
    providers: { ...config.providers, [provider]: { ...entry, models } },
  }
}

async function writeCompactionForWindow(
  contextWindow: number,
  modelKey: string,
  options: { saveWindow: boolean; forceEnable: boolean },
): Promise<void> {
  const settings = await readAppSettings()
  const prevCompaction = asRecord(settings.compaction)
  const prevOverrides = asRecord(prevCompaction.modelOverrides)
  const prevModelOverride = asRecord(prevOverrides[modelKey])
  const prevMap = asRecord(settings.modelContextWindows)
  const reserveTokens = Math.round(contextWindow * COMPACT_RESERVE_RATIO)
  const enabled = options.forceEnable ? true : prevCompaction.enabled !== false

  await writeAppSettings({
    compaction: {
      ...prevCompaction,
      enabled,
      reserveTokens,
      modelOverrides: { ...prevOverrides, [modelKey]: { ...prevModelOverride, reserveTokens } },
    },
    ...(options.saveWindow
      ? { modelContextWindows: { ...prevMap, [modelKey]: contextWindow } }
      : {}),
  })
}

async function syncLiveRuntimeContextWindow(): Promise<void> {
  await rpcClient.send({ type: 'prompt', message: `/${SYNC_CONTEXT_WINDOW_COMMAND}` })
}

function enqueueSync(task: () => Promise<void>): Promise<void> {
  syncQueue = syncQueue.then(task, task)
  return syncQueue
}

/** 切换模型后，按该模型保存的上下文窗口同步 80% 自动压缩预留并热刷活进程。 */
export function syncCompactionForModel(provider: string, modelId: string): Promise<void> {
  const key = modelContextKey(provider, modelId)
  const saved = useAppStore.getState().modelContextWindows[key]
  if (!saved) return Promise.resolve()
  return enqueueSync(async () => {
    try {
      await writeCompactionForWindow(saved, key, { saveWindow: false, forceEnable: false })
      await syncLiveRuntimeContextWindow()
    } catch {
      // 后台同步失败不打断切模型主流程
    }
  })
}

/**
 * 为当前模型保存上下文窗口档位（200k / 500k / 1M），同步按 80% 阈值写入自动压缩预留，
 * 并立即通知运行中的 pi 进程重载设置与当前模型的 contextWindow。
 */
export function applyContextWindowPreset(contextWindow: number): Promise<void> {
  const store = useChatStore.getState()
  const session = store.session
  const model = session?.model
  if (!model) return Promise.resolve()

  const key = modelContextKey(model.provider, model.id)
  useAppStore.getState().setModelContextWindow(key, contextWindow)
  store.setSession({
    ...session,
    autoCompactionEnabled: true,
    model: { ...model, contextWindow },
  })

  return enqueueSync(async () => {
    try {
      await writeCompactionForWindow(contextWindow, key, { saveWindow: true, forceEnable: true })
      const patched = patchProviderModels(
        await readModelsConfig(),
        model.provider,
        model.id,
        contextWindow,
      )
      if (patched) await writeModelsConfig(patched)
      await syncLiveRuntimeContextWindow()
    } catch (error) {
      useChatStore.getState().setError(errorMessage(error))
    }
  })
}
