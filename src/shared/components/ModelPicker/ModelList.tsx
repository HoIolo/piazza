import { Check, ChevronLeft, Settings } from 'lucide-react'
import { MenuEmpty, MenuItem, MenuSeparator } from '@/design/primitives/MenuList'
import { Spinner } from '@/design/primitives/Spinner'
import type { Model } from '@/rpc/types'
import { useAppStore } from '@/store/app.store'
import styles from './ModelPicker.module.css'

interface ModelListProps {
  current: Model | null | undefined
  models: Model[]
  loading: boolean
  error: string | undefined
  rpcReady: boolean
  onBack?: () => void
  onPick: (model: Model) => void
  close: () => void
}

export function ModelList({
  current,
  models,
  loading,
  error,
  rpcReady,
  onBack,
  onPick,
  close,
}: ModelListProps) {
  const cwd = useAppStore((s) => s.currentCwd)
  const openSettings = useAppStore((s) => s.openSettings)
  const emptyMessage = !cwd ? '选择项目后可使用模型' : rpcReady ? '没有可用模型' : 'Pi 会话未就绪'

  return (
    <>
      {onBack && (
        <button type="button" className={styles.back} onClick={onBack}>
          <ChevronLeft size={14} />
          选择模型
        </button>
      )}
      {loading ? (
        <MenuEmpty>
          <Spinner size={12} /> 正在读取模型列表…
        </MenuEmpty>
      ) : models.length ? (
        <div className={styles.modelList}>
          {models.map((model) => (
            <ModelRow
              key={`${model.provider}/${model.id}`}
              model={model}
              current={current}
              onPick={onPick}
            />
          ))}
        </div>
      ) : (
        <MenuEmpty>{error ?? emptyMessage}</MenuEmpty>
      )}
      <MenuSeparator />
      <MenuItem
        icon={<Settings size={15} />}
        onClick={() => {
          close()
          openSettings('models')
        }}
      >
        配置模型
      </MenuItem>
    </>
  )
}

function ModelRow({
  model,
  current,
  onPick,
}: Pick<ModelListProps, 'current' | 'onPick'> & { model: Model }) {
  const selected = model.id === current?.id && model.provider === current.provider
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={styles.modelItem}
      onClick={() => onPick(model)}
    >
      <span className={styles.modelText}>
        <span className={styles.modelName}>{model.name?.trim() || model.id}</span>
        <span className={styles.modelProvider}>{model.provider}</span>
      </span>
      {selected && <Check size={14} className={styles.check} />}
    </button>
  )
}
