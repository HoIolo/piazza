import { Plus, Trash2 } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { TextField } from '@/design/primitives/TextField'
import type { SectionProps } from './GeneralSection'
import styles from './PackagesSection.module.css'

/** 扩展与包：对应 settings.json 的 packages 数组 */
export function PackagesSection({ settings }: SectionProps) {
  const packages = settings.read<string[]>('packages', [])
  const setPackages = (next: string[]) => settings.update('packages', next)

  return (
    <Card title="已安装的包">
      <div className={styles.body}>
        <p className={styles.hint}>
          每行一个包来源，如 <code>npm:pi-web-access</code> 或 GitHub 仓库地址。
          保存后由 pi 在下次启动时加载。
        </p>

        {packages.map((pkg, index) => (
          <div key={index} className={styles.row}>
            <TextField
              value={pkg}
              monospace
              onChange={(v) => setPackages(packages.map((p, i) => (i === index ? v : p)))}
            />
            <button
              type="button"
              className={styles.remove}
              onClick={() => setPackages(packages.filter((_, i) => i !== index))}
              aria-label="移除包"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}

        <button
          type="button"
          className={styles.add}
          onClick={() => setPackages([...packages, ''])}
        >
          <Plus size={14} />
          添加包
        </button>
      </div>
    </Card>
  )
}
