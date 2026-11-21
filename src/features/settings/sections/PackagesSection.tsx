import { useEffect, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { Plus, Trash2 } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import { TextField } from '@/design/primitives/TextField'
import {
  deleteLocalExtension,
  getAgentDir,
  listLocalExtensions,
  type ExtensionEntry,
} from '@/shared/api/agentResources'
import { errorMessage } from '@/shared/utils/error'
import { refreshRuntimeAfterSave } from '@/store/chat/refreshRuntime'
import type { SectionProps } from './AppearanceSection'
import { LocalExtensionsCard } from './LocalExtensionsCard'
import styles from './CapabilityList.module.css'

function packageSourceTag(pkg: string): string {
  if (pkg.startsWith('npm:')) return 'npm'
  if (pkg.startsWith('git:') || pkg.includes('github.com')) return 'git'
  return 'local'
}

/** 扩展与包：展示 <agent>/extensions 本地扩展并管理 settings.json 的 packages */
export function PackagesSection({ settings }: SectionProps) {
  const packages = settings.read<string[]>('packages', [])
  const [draftPkg, setDraftPkg] = useState('')
  const [extensions, setExtensions] = useState<ExtensionEntry[]>([])
  const [agentDir, setAgentDir] = useState('')
  const [nonce, setNonce] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void listLocalExtensions()
      .then(setExtensions)
      .catch(() => undefined)
    void getAgentDir()
      .then(setAgentDir)
      .catch(() => undefined)
  }, [nonce])

  const addPackage = () => {
    const trimmed = draftPkg.trim()
    if (!trimmed || packages.includes(trimmed)) return
    settings.update('packages', [...packages, trimmed])
    setDraftPkg('')
  }

  const deleteExtension = async (ext: ExtensionEntry) => {
    const ok = await ask(`「${ext.name}」会被移入废纸篓，之后 pi 不再加载它。`, {
      title: '删除扩展？',
      kind: 'warning',
      okLabel: '删除',
      cancelLabel: '取消',
    })
    if (!ok) return
    try {
      await deleteLocalExtension(ext.path)
      // 扩展是启动时加载的，删完得重启 pi 才会真正从工具列表里消失
      refreshRuntimeAfterSave()
      setError(null)
      setNonce((n) => n + 1)
    } catch (e: unknown) {
      setError(errorMessage(e))
    }
  }

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Card title="已安装的扩展包 (packages)">
        <div className={styles.list}>
          {packages.length === 0 ? (
            <p className={styles.empty}>暂无外部扩展包，可在下方输入 npm: 或 git: 来源添加</p>
          ) : (
            packages.map((pkg, index) => (
              <div key={`${pkg}:${index}`} className={styles.item}>
                <div className={styles.itemMain}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemName}>{pkg}</span>
                    <span className={styles.badge}>{packageSourceTag(pkg)}</span>
                  </div>
                </div>
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    onClick={() =>
                      settings.update(
                        'packages',
                        packages.filter((_, i) => i !== index),
                      )
                    }
                    aria-label="移除包"
                    title="移除包"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
          <div className={styles.addBar}>
            <TextField
              value={draftPkg}
              monospace
              placeholder="如 npm:pi-web-access 或 git:github.com/user/repo"
              ariaLabel="添加扩展包"
              onChange={setDraftPkg}
            />
            <Pill icon={<Plus size={14} />} onClick={addPackage} disabled={!draftPkg.trim()}>
              添加
            </Pill>
          </div>
        </div>
      </Card>

      <LocalExtensionsCard
        extensions={extensions}
        extDir={agentDir ? `${agentDir}/extensions` : ''}
        onDelete={(ext) => void deleteExtension(ext)}
      />
    </>
  )
}
