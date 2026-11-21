import { useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { Plus } from 'lucide-react'
import { Pill } from '@/design/primitives/Pill'
import { useAgentDir } from '@/shared/hooks/useAgentDir'
import { Segmented } from '@/design/primitives/Segmented'
import { ProviderAccounts } from '../components/ProviderAccounts'
import { Skeleton } from '@/design/primitives/Skeleton'
import { errorMessage } from '@/shared/utils/error'
import { ModelsEditor, type Editor } from '../components/ModelsEditor'
import { ProviderCard } from '../components/ProviderCard'
import { removeKey, removeModel, type ProviderMap } from '../hooks/providerOps'
import { useModelsConfig } from '../hooks/useModelsConfig'
import styles from './ModelsSection.module.css'

/** 删除走系统确认框：这是整页唯一不可逆的动作，值得打断一下 */
function confirmDelete(what: string): Promise<boolean> {
  return ask(`原文件会备份为 models.json.bak，但界面上不会再出现它。`, {
    title: `删除${what}？`,
    kind: 'warning',
    okLabel: '删除',
    cancelLabel: '取消',
  })
}

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

/**
 * 模型与账号配置页。
 *
 * 页面只是概览：每个 provider 一张卡，列出它的模型和几个能力标签。
 * 所有输入框都在对话框里，按「保存」即写入 <agent>/models.json——
 * 没有页面级的草稿与保存按钮，改一处就落一处。
 */
export function ModelsSection() {
  const [tab, setTab] = useState('oauth')
  return (
    <div className={styles.page}>
      <div className={styles.navigation}>
        <Segmented
          ariaLabel="服务商接入方式"
          value={tab}
          options={[
            { value: 'oauth', label: '账号与订阅' },
            { value: 'api_key', label: '厂商 API Key' },
            { value: 'custom', label: '自定义服务商' },
          ]}
          onChange={setTab}
        />
      </div>
      {tab === 'custom' ? (
        <CustomProviders />
      ) : (
        <ProviderAccounts method={tab === 'oauth' ? 'oauth' : 'api_key'} />
      )}
    </div>
  )
}

function CustomProviders() {
  const agentDir = useAgentDir()
  const { providers, loading, error, saved, commit } = useModelsConfig()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const run = (transform: (p: ProviderMap) => ProviderMap) =>
    commit(transform).catch((e: unknown) => setActionError(errorMessage(e)))

  const deleteProvider = async (key: string) => {
    if (!(await confirmDelete(`Provider「${providers[key].name?.trim() || key}」`))) return
    void run((p) => removeKey(p, key))
  }

  const deleteModel = async (key: string, index: number) => {
    const model = providers[key].models?.[index]
    if (!model || !(await confirmDelete(`模型「${model.name?.trim() || model.id}」`))) return
    void run((p) => removeModel(p, key, index))
  }

  if (loading) return <ModelsSkeleton />

  const entries = Object.entries(providers)
  const problem = error ?? actionError

  return (
    <div>
      <div className={styles.toolbar}>
        <p className={styles.path}>
          配置文件：{agentDir ? `${agentDir}/models.json` : 'models.json'}
          {saved && <span className={styles.saved}>已保存，原文件备份为 .bak</span>}
        </p>
        <Pill icon={<Plus size={14} />} onClick={() => setEditor({ kind: 'provider', key: null })}>
          添加自定义服务商
        </Pill>
      </div>

      {problem && <p className={styles.error}>{problem}</p>}

      {entries.length === 0 && (
        <p className={styles.hint}>还没有自定义服务商，点击「添加自定义服务商」开始配置。</p>
      )}

      {entries.map(([key, provider]) => (
        <ProviderCard
          key={key}
          providerKey={key}
          provider={provider}
          onEdit={() => setEditor({ kind: 'provider', key })}
          onRemove={() => void deleteProvider(key)}
          onAddModel={() => setEditor({ kind: 'model', key, index: null })}
          onEditModel={(index) => setEditor({ kind: 'model', key, index })}
          onRemoveModel={(index) => void deleteModel(key, index)}
        />
      ))}

      {editor && (
        <ModelsEditor
          editor={editor}
          providers={providers}
          onClose={() => setEditor(null)}
          onCommit={commit}
        />
      )}
    </div>
  )
}
