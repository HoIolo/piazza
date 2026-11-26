import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Popover } from '@/design/primitives/Popover'
import type { AvailableModels, AvailableThinkingLevels, Model, SessionState, ThinkingLevel } from '@/rpc/types'
import { thinkingLabel } from '@/shared/utils/format'
import { useChatStore, useSessionActions } from '@/store/chat'
import { isPlaceholderModel } from '@/store/chat/modelFallback'
import { useModelOptions } from './useModelOptions'
import { ModelControls } from './ModelControls'
import { ModelList } from './ModelList'
import styles from './ModelPicker.module.css'

/** 独立会话控制器：侧边聊天传入自己的会话与 RPC 动作，不与主会话串线 */
export interface ModelPickerController {
  session: SessionState | null
  rpcReady: boolean
  loading?: boolean
  fetchModels: () => Promise<AvailableModels>
  fetchLevels: () => Promise<AvailableThinkingLevels>
  setModel: (provider: string, modelId: string) => Promise<void>
  setThinkingLevel: (level: ThinkingLevel) => Promise<void>
  setContextWindow?: (contextWindow: number) => Promise<void>
  onReconnect?: () => void
}

function modelLabel(model: Model | null | undefined): string {
  if (!model || isPlaceholderModel(model)) return '未选择模型'
  return model.name?.trim() || model.id
}

function useResolvedPicker(controller?: ModelPickerController) {
  const mainSession = useChatStore((s) => s.session)
  const mainReady = useChatStore((s) => s.rpcReady)
  const mainFailed = useChatStore((s) => s.error?.fatal)
  const mainActions = useSessionActions()
  const source = controller ?? {
    session: mainSession,
    rpcReady: mainReady,
    setModel: mainActions.setModel,
    setThinkingLevel: mainActions.setThinkingLevel,
    setContextWindow: mainActions.setContextWindow,
    loading: undefined,
    onReconnect: undefined,
  }
  const fetcher = controller
    ? { fetchModels: controller.fetchModels, fetchLevels: controller.fetchLevels }
    : undefined
  const options = useModelOptions(source.rpcReady, source.session, fetcher, source.loading)
  const { setContextWindow } = source
  return {
    session: source.session,
    rpcReady: source.rpcReady,
    options:
      !controller && !mainReady && mainFailed
        ? { ...options, error: '会话连接失败' }
        : options,
    canShowControls: source.rpcReady && !isPlaceholderModel(source.session?.model),
    setModel: source.setModel,
    setThinkingLevel: source.setThinkingLevel,
    onContextChange: setContextWindow ? (w: number) => void setContextWindow(w) : undefined,
    onReconnect: source.onReconnect,
  }
}

function SimpleModelPane({
  resolved,
  onOpenModels,
}: {
  resolved: ReturnType<typeof useResolvedPicker>
  onOpenModels: () => void
}) {
  const { session, options, setThinkingLevel, onContextChange } = resolved
  const currentLevel = session?.thinkingLevel
  return (
    <>
      <button type="button" className={styles.viewToggle} onClick={onOpenModels} aria-label="选择模型">
        <span className={styles.viewToggleName}>{modelLabel(session?.model)}</span>
        {options.levels.length > 1 && currentLevel && (
          <span className={styles.viewToggleLevel}>{thinkingLabel(currentLevel)}</span>
        )}
        <ChevronRight size={13} className={styles.viewToggleIcon} />
      </button>
      <ModelControls
        session={session}
        levels={options.levels}
        loading={options.loading}
        onChange={(level: ThinkingLevel) => void setThinkingLevel(level)}
        onContextChange={onContextChange}
      />
    </>
  )
}

function PickerBody({ close, controller }: { close: () => void; controller?: ModelPickerController }) {
  const [view, setView] = useState<'simple' | 'models' | null>(null)
  const resolved = useResolvedPicker(controller)
  const { session, rpcReady, options, canShowControls, setModel, onReconnect } = resolved

  return (
    <div key={view} className={styles.pane} data-motion={view ?? 'none'}>
      {view === 'models' || !canShowControls ? (
        <ModelList
          current={session?.model}
          models={options.models}
          loading={options.loading}
          error={options.error}
          rpcReady={rpcReady}
          onBack={canShowControls ? () => setView('simple') : undefined}
          onPick={async (model) => {
            await setModel(model.provider, model.id)
            setView('simple')
          }}
          onReconnect={onReconnect}
          close={close}
        />
      ) : (
        <SimpleModelPane resolved={resolved} onOpenModels={() => setView('models')} />
      )}
    </div>
  )
}

/** 输入区右下角的「模型 + 推理强度」选择器，支持绑定主会话或独立的侧边聊天控制器 */
export function ModelPicker({ controller }: { controller?: ModelPickerController }) {
  const mainModel = useChatStore((s) => s.session?.model ?? s.lastModel)
  const mainLevel = useChatStore((s) => s.session?.thinkingLevel ?? s.lastThinkingLevel)
  const model = controller ? controller.session?.model : mainModel
  const level = controller ? controller.session?.thinkingLevel : mainLevel

  return (
    <Popover
      align="end"
      panelClassName={styles.panel}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.trigger}
          data-open={open}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          title="选择模型"
        >
          <span className={styles.triggerName}>{modelLabel(model)}</span>
          {!isPlaceholderModel(model) && level && level !== 'off' && (
            <span className={styles.triggerLevel}>{thinkingLabel(level)}</span>
          )}
          <ChevronDown size={14} className={styles.chevron} />
        </button>
      )}
    >
      {(close) => <PickerBody close={close} controller={controller} />}
    </Popover>
  )
}
