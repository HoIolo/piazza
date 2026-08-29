import { Plus } from 'lucide-react'
import { Pill } from '@/design/primitives/Pill'
import { Skeleton } from '@/design/primitives/Skeleton'
import { Spinner } from '@/design/primitives/Spinner'
import { ProviderCard } from '../components/ProviderCard'
import { useModelsConfig } from '../hooks/useModelsConfig'
import styles from './ModelsSection.module.css'

/** 读取配置期间的占位，形状贴合 Provider 卡片 */
function ModelsSkeleton() {
  return (
    <div aria-busy="true" aria-label="正在读取模型配置">
      {[0, 1].map((i) => (
        <div key={i} className={styles.skeletonCard}>
          <Skeleton width="40%" height="18px" />
          <Skeleton width="70%" height="13px" />
          <Skeleton width="55%" height="13px" />
        </div>
      ))}
    </div>
  )
}

/** 模型与 Provider 配置页：可视化编辑 ~/.pi/agent/models.json */
export function ModelsSection() {
  const {
    config,
    loading,
    error,
    saved,
    saving,
    dirty,
    updateProvider,
    renameProvider,
    removeProvider,
    addProvider,
    save,
  } = useModelsConfig()

  if (loading) return <ModelsSkeleton />

  const providers = Object.entries(config.providers ?? {})

  return (
    <div>
      <div className={styles.toolbar}>
        <p className={styles.path}>配置文件：~/.pi/agent/models.json</p>
        <div className={styles.actions}>
          <Pill icon={<Plus size={14} />} onClick={addProvider}>
            添加 Provider
          </Pill>
          <button type="button" className={styles.save} disabled={!dirty || saving} onClick={save}>
            {saving && <Spinner size={13} ariaLabel="正在保存" />}
            {saving ? '保存中' : '保存'}
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {saved && !dirty && <p className={styles.saved}>已保存，原文件已备份为 models.json.bak</p>}

      {providers.length === 0 && (
        <p className={styles.hint}>还没有自定义 Provider，点击「添加 Provider」开始配置。</p>
      )}

      {providers.map(([key, provider]) => (
        <ProviderCard
          key={key}
          providerKey={key}
          provider={provider}
          onChange={(next) => updateProvider(key, next)}
          onRename={(nextKey) => renameProvider(key, nextKey)}
          onRemove={() => removeProvider(key)}
        />
      ))}
    </div>
  )
}
