import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Popover } from '@/design/primitives/Popover'
import type { Model, ThinkingLevel } from '@/rpc/types'
import { thinkingLabel } from '@/shared/utils/format'
import { useChatStore, useSessionActions } from '@/store/chat'
import { isPlaceholderModel } from '@/store/chat/modelFallback'
import { useModelOptions } from './useModelOptions'
import { ModelControls } from './ModelControls'
import { ModelList } from './ModelList'
import styles from './ModelPicker.module.css'

/**
 * 模型显示名。没配 name 的自定义模型退回 id；
 * pi 在没解析出模型时给的是全 unknown 的占位对象，要当成「未选择」。
 */
function modelLabel(model: Model | null | undefined): string {
  if (!model || isPlaceholderModel(model)) return '未选择模型'
  return model.name?.trim() || model.id
}

/**
 * 弹层内容，两个视图来回切，对应 Codex 的 simple / advanced：
 * 默认是「当前模型 + 推理强度滑杆」，点模型那一行才进模型列表。
 *
 * 强度比模型换得勤得多，所以它占默认视图；模型列表可能有几十项，
 * 和滑杆摆在一起会把最常用的控件挤到一屏之外。
 */
function PickerBody({ close }: { close: () => void }) {
  const [view, setView] = useState<'simple' | 'models' | null>(null)
  const session = useChatStore((s) => s.session)
  const rpcReady = useChatStore((s) => s.rpcReady)
  const { setModel, setThinkingLevel, setContextWindow } = useSessionActions()
  const { models, levels, loading, error } = useModelOptions(rpcReady, session)

  const currentModel = session?.model
  const currentLevel = session?.thinkingLevel
  const canShowControls = rpcReady && !isPlaceholderModel(currentModel)

  return (
    <div key={view} className={styles.pane} data-motion={view ?? 'none'}>
      {view === 'models' || !canShowControls ? (
        <ModelList
          current={currentModel}
          models={models}
          loading={loading}
          error={error}
          rpcReady={rpcReady}
          onBack={canShowControls ? () => setView('simple') : undefined}
          onPick={async (model) => {
            await setModel(model.provider, model.id)
            setView('simple')
          }}
          close={close}
        />
      ) : (
        <>
          <button
            type="button"
            className={styles.viewToggle}
            onClick={() => setView('models')}
            aria-label="选择模型"
          >
            <span className={styles.viewToggleName}>{modelLabel(currentModel)}</span>
            {levels.length > 1 && currentLevel && (
              <span className={styles.viewToggleLevel}>{thinkingLabel(currentLevel)}</span>
            )}
            <ChevronRight size={13} className={styles.viewToggleIcon} />
          </button>

          <ModelControls
            session={session}
            levels={levels}
            loading={loading}
            onChange={(level: ThinkingLevel) => void setThinkingLevel(level)}
            onContextChange={(contextWindow) => void setContextWindow(contextWindow)}
          />
        </>
      )}
    </div>
  )
}

/** 输入区右下角的「模型 + 推理强度」选择器，对应 Codex 的同名控件 */
export function ModelPicker() {
  const model = useChatStore((s) => s.session?.model ?? s.lastModel)
  const level = useChatStore((s) => s.session?.thinkingLevel ?? s.lastThinkingLevel)

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
      {/* 内容单独成组件：视图状态随弹层卸载而重置，每次打开都回到滑杆 */}
      {(close) => <PickerBody close={close} />}
    </Popover>
  )
}
