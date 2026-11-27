import { FolderOpen, Sparkles } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import { Row } from '@/design/primitives/Row'
import { Segmented } from '@/design/primitives/Segmented'
import { Spinner } from '@/design/primitives/Spinner'
import { Toggle } from '@/design/primitives/Toggle'
import type { AutoExtractMode, MemoryDreamState } from '@/shared/api/memory'
import { openPathWith } from '@/shared/api/pi'
import memStyles from '../sections/MemorySection.module.css'

const EXTRACT_DESC: Record<AutoExtractMode, string> = {
  smart: '强信号漏记兜底 + 长会话低频批抽 + 压缩前提炼，强制关闭思考链且冻结当前会话缓存',
  signal: '仅在识别到偏好/纠错指令且主模型漏记时后台补记，日常问答几乎零开销',
  off: '关闭后台提炼，仅通过对话中主模型调用 memory_write 或下方手动管理',
}

function formatDreamDesc(dream: MemoryDreamState | null | undefined, notice: string | null): string {
  if (notice) return notice
  if (dream?.lastRunAt) {
    const day = dream.lastRunAt.slice(0, 16).replace('T', ' ')
    const tail = dream.lastSummary ? ` · ${dream.lastSummary}` : ''
    return `上次整理：${day} UTC${tail}`
  }
  return '记忆达到 8 条且累计满 5 次会话 / 24h 后自动后台合并重复项与过时条目，也可手动触发'
}

export interface MemorySettingsCardProps {
  enabled: boolean
  autoExtract: AutoExtractMode
  autoDream: boolean
  globalCount: number
  projectCount: number
  memoryRoot?: string
  dream?: MemoryDreamState | null
  consolidating: boolean
  dreamNotice: string | null
  onToggle: (v: boolean) => void
  onAutoExtractChange: (mode: AutoExtractMode) => void
  onAutoDreamChange: (v: boolean) => void
  onConsolidate: () => void
}

export function MemorySettingsCard({
  enabled,
  autoExtract,
  autoDream,
  globalCount,
  projectCount,
  memoryRoot,
  dream,
  consolidating,
  dreamNotice,
  onToggle,
  onAutoExtractChange,
  onAutoDreamChange,
  onConsolidate,
}: MemorySettingsCardProps) {
  const totalCount = globalCount + projectCount
  return (
    <Card title="内置长期记忆">
      <Row
        title="启用内置记忆"
        description={`纯 Markdown 双层隔离存储（全局 ${globalCount} 条 · 项目 ${projectCount} 条），支持会话内冻结快照护缓存与本地历史会话检索`}
        control={<Toggle checked={enabled} onChange={onToggle} />}
      />
      <div className={memStyles.subOptions} data-open={enabled} aria-hidden={!enabled}>
        <div className={memStyles.subOptionsInner}>
          <Row
            title="后台自动提炼"
            description={EXTRACT_DESC[autoExtract]}
            control={
              <Segmented
                value={autoExtract}
                options={[
                  { value: 'smart', label: '智能节能' },
                  { value: 'signal', label: '仅强信号' },
                  { value: 'off', label: '关闭' },
                ]}
                onChange={(v) => onAutoExtractChange(v as AutoExtractMode)}
              />
            }
          />
          <Row
            title="记忆整理去重（Dream）"
            description={formatDreamDesc(dream, dreamNotice)}
            control={
              <div className={memStyles.dreamControls}>
                <Toggle checked={autoDream} onChange={onAutoDreamChange} />
                <Pill
                  icon={consolidating ? <Spinner size={12} ariaLabel="正在整理" /> : <Sparkles size={13} />}
                  disabled={consolidating || totalCount === 0}
                  onClick={onConsolidate}
                >
                  {consolidating ? '整理中…' : '立即整理'}
                </Pill>
              </div>
            }
          />
        </div>
      </div>
      {memoryRoot && (
        <Row
          title="记忆存储目录"
          description={memoryRoot}
          control={
            <Pill icon={<FolderOpen size={13} />} onClick={() => void openPathWith('', memoryRoot)}>
              打开目录
            </Pill>
          }
        />
      )}
    </Card>
  )
}
