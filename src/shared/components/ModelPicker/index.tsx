import { useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { MenuEmpty } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { Spinner } from '@/design/primitives/Spinner'
import type { Model, ThinkingLevel } from '@/rpc/types'
import { thinkingLabel } from '@/shared/utils/format'
import { useChatStore, useSessionActions } from '@/store/chat'
import { useModelOptions } from './useModelOptions'
import { ModelControls } from './ModelControls'
import styles from './ModelPicker.module.css'

/**
 * 模型显示名。没配 name 的自定义模型退回 id；
 * pi 在没解析出模型时给的是全 unknown 的占位对象，要当成「未选择」。
 */
function modelLabel(model: Model | null | undefined): string {
  const name = model?.name?.trim()
  if (name) return name
  const id = model?.id?.trim()
  if (id && id !== 'unknown') return id
  return '未选择模型'
}

/** 模型列表。选中对勾在右，provider 作副文案——同名模型靠它区分来源 */
function ModelList({
  models,
  current,
  onPick,
}: {
  models: Model[]
  current: Model | null | undefined
  onPick: (model: Model) => void
}) {
  if (models.length === 0) return <MenuEmpty>没有可用模型</MenuEmpty>

  return (
    <div className={styles.modelList}>
      {models.map((model) => {
        const selected = model.id === current?.id && model.provider === current.provider
        return (
          <button
            key={`${model.provider}/${model.id}`}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            className={styles.modelItem}
            onClick={() => onPick(model)}
          >
            <span className={styles.modelText}>
              <span className={styles.modelName}>{modelLabel(model)}</span>
              <span className={styles.modelProvider}>{model.provider}</span>
            </span>
            {selected && <Check size={14} className={styles.check} />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 弹层内容，两个视图来回切，对应 Codex 的 simple / advanced：
 * 默认是「当前模型 + 推理强度滑杆」，点模型那一行才进模型列表。
 *
 * 强度比模型换得勤得多，所以它占默认视图；模型列表可能有几十项，
 * 和滑杆摆在一起会把最常用的控件挤到一屏之外。
 */
function PickerBody() {
  const [view, setView] = useState<'simple' | 'models'>('simple')
  const [navigated, setNavigated] = useState(false)
  const session = useChatStore((s) => s.session)
  const { setModel, setThinkingLevel, setContextWindow } = useSessionActions()
  const { models, levels, loading, error } = useModelOptions()

  const currentModel = session?.model
  const currentLevel = session?.thinkingLevel

  const switchView = (next: 'simple' | 'models') => {
    setNavigated(true)
    setView(next)
  }

  return (
    <div key={view} className={styles.pane} data-motion={navigated ? view : 'none'}>
      {view === 'models' ? (
        <>
          <button type="button" className={styles.back} onClick={() => switchView('simple')}>
            <ChevronLeft size={14} />
            选择模型
            {loading && <Spinner size={12} ariaLabel="正在读取模型列表" />}
          </button>
          {error && <MenuEmpty>{error}</MenuEmpty>}
          <ModelList
            models={models}
            current={currentModel}
            onPick={(model) => {
              void setModel(model.provider, model.id)
              // 不关弹层，回到滑杆——换了模型多半还要顺手调强度
              switchView('simple')
            }}
          />
        </>
      ) : (
        <>
          <button
            type="button"
            className={styles.viewToggle}
            onClick={() => switchView('models')}
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
  const loading = useChatStore((s) => s.sessionLoading)

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
          disabled={loading}
          aria-haspopup="menu"
          aria-expanded={open}
          title="选择模型"
        >
          <span className={styles.triggerName}>{modelLabel(model)}</span>
          {level && level !== 'off' && (
            <span className={styles.triggerLevel}>{thinkingLabel(level)}</span>
          )}
          <ChevronDown size={14} className={styles.chevron} />
        </button>
      )}
    >
      {/* 内容单独成组件：视图状态随弹层卸载而重置，每次打开都回到滑杆 */}
      {() => <PickerBody />}
    </Popover>
  )
}
