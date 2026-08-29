import { Diff, ListTree } from 'lucide-react'
import { MenuGroupLabel } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { BranchPicker } from '@/shared/components/BranchPicker'
import { WorkModePicker } from '@/shared/components/WorkModePicker'
import { useGitBranch } from '@/shared/hooks/useGitBranch'
import { useGitDiffStat } from '@/shared/hooks/useGitDiffStat'
import { useAppStore } from '@/store/app.store'
import styles from './EnvMenu.module.css'

/**
 * 环境信息弹窗，挂在顶栏「打开位置」右侧。
 *
 * 这些信息本来在右侧面板里，但右侧面板是放审阅/终端/文件这类工作区的；
 * 环境信息是一眼扫过就走的状态，做成弹窗更合适，也和 Codex 一致。
 *
 * Codex 原版还有「提交或推送」与拉取请求状态：前者不做——代码提交应该由用户
 * 自己掌控，不适合藏在一个弹窗里；后者 pi 没有 GitHub 集成，摆上去就是死按钮。
 */
export function EnvMenu() {
  const cwd = useAppStore((s) => s.currentCwd)
  const branch = useGitBranch(cwd)
  const stat = useGitDiffStat(cwd)

  return (
    <Popover
      side="bottom"
      align="end"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.trigger}
          data-open={open}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="环境信息"
          title="环境信息"
        >
          <ListTree size={17} />
        </button>
      )}
    >
      {() => (
        <div className={styles.panel}>
          <MenuGroupLabel>环境信息</MenuGroupLabel>

          <div className={styles.row}>
            <Diff size={17} className={styles.icon} />
            <span className={styles.label}>变更</span>
            {stat ? (
              <span className={styles.stat}>
                <span className={styles.added}>+{stat.added.toLocaleString()}</span>
                <span className={styles.removed}>-{stat.removed.toLocaleString()}</span>
              </span>
            ) : (
              <span className={styles.muted}>非 git 目录</span>
            )}
          </div>

          <div className={styles.pickerRow}>
            <WorkModePicker />
          </div>

          {branch && (
            <div className={styles.pickerRow}>
              <BranchPicker branch={branch} />
            </div>
          )}
        </div>
      )}
    </Popover>
  )
}
