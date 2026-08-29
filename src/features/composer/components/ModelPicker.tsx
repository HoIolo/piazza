import { MenuEmpty, MenuItem } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { Spinner } from '@/design/primitives/Spinner'
import type { Model, ThinkingLevel } from '@/rpc/types'
import { thinkingLabel } from '@/shared/utils/format'
import { useChatStore, useSessionActions } from '@/store/chat'
import { useModelOptions } from '../hooks/useModelOptions'
import styles from './ModelPicker.module.css'

/** 模型列表。按 provider 前缀展示，同名模型才能区分来源 */
function ModelMenu({ models, currentId, onPick }: {
  models: Model[]
  currentId: string | null
  onPick: (model: Model) => void
}) {
  if (models.length === 0) return <MenuEmpty>没有可用模型</MenuEmpty>

  return (
    <>
      {models.map((model) => (
        <MenuItem
          key={`${model.provider}/${model.id}`}
          selected={model.id === currentId}
          hint={model.provider}
          onClick={() => onPick(model)}
        >
          {model.name ?? model.id}
        </MenuItem>
      ))}
    </>
  )
}

/** 输入区右下角的「模型 + 推理强度」选择器，对应 Codex 的同名控件 */
export function ModelPicker() {
  const session = useChatStore((s) => s.session)
  const { setModel, setThinkingLevel } = useSessionActions()
  const { models, levels, loading } = useModelOptions()

  const currentModel = session?.model
  const currentLevel = session?.thinkingLevel
  const label = currentModel?.name ?? currentModel?.id ?? '未选择模型'

  return (
    <Popover
      align="end"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.trigger}
          data-open={open}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {label}
          {currentLevel && currentLevel !== 'off' && (
            <span className={styles.level}>{thinkingLabel(currentLevel)}</span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div className={styles.panel}>
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              模型
              {loading && <Spinner size={12} ariaLabel="正在读取模型列表" />}
            </div>
            <ModelMenu
              models={models}
              currentId={currentModel?.id ?? null}
              onPick={(model) => {
                void setModel(model.provider, model.id)
                close()
              }}
            />
          </div>

          {levels.length > 1 && (
            <div className={styles.section}>
              <div className={styles.sectionHead}>推理强度</div>
              {levels.map((level) => (
                <MenuItem
                  key={level}
                  selected={level === currentLevel}
                  onClick={() => {
                    void setThinkingLevel(level as ThinkingLevel)
                    close()
                  }}
                >
                  {thinkingLabel(level) || level}
                </MenuItem>
              ))}
            </div>
          )}
        </div>
      )}
    </Popover>
  )
}
