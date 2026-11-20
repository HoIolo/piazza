import { Diff } from 'lucide-react'
import { MenuGroupLabel } from '@/design/primitives/MenuList'
import { BranchPicker } from '@/shared/components/BranchPicker'
import { WorkModePicker } from '@/shared/components/WorkModePicker'
import { useGitBranch } from '@/shared/hooks/useGitBranch'
import { useGitDiffStat } from '@/shared/hooks/useGitDiffStat'
import { useAppStore } from '@/store/app.store'
import styles from './EnvInfo.module.css'

/**
 * 环境信息正文：变更行数、工作模式、分支。
 *
 * 顶栏弹窗与会话区右侧的停靠卡片共用这一份，两处只是外壳不同。
 * git 数据在这里取而不是外层：谁挂载谁取，弹窗没打开时就不必每次切会话都 spawn git。
 *
 * 两个选择器一律向下弹：这块内容总是贴着窗口上缘，向上弹会出屏。
 *
 * Codex 原版还有「提交或推送」与拉取请求状态：前者不做——代码提交应该由用户
 * 自己掌控，不适合藏在一个面板里；后者 pi 没有 GitHub 集成，摆上去就是死按钮。
 */
export function EnvInfo() {
  const cwd = useAppStore((s) => s.currentCwd)
  const branch = useGitBranch(cwd)
  const stat = useGitDiffStat(cwd)

  return (
    <div className={styles.body}>
      <MenuGroupLabel>环境信息</MenuGroupLabel>

      <div className={styles.row}>
        <Diff size={15} className={styles.icon} />
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
        <WorkModePicker side="bottom" />
      </div>

      {branch && (
        <div className={styles.pickerRow}>
          <BranchPicker branch={branch} side="bottom" />
        </div>
      )}
    </div>
  )
}
