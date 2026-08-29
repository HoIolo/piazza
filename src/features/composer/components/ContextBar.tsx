import { BranchPicker } from '@/shared/components/BranchPicker'
import { WorkModePicker } from '@/shared/components/WorkModePicker'
import { ProjectPicker } from './ProjectPicker'
import styles from './ContextBar.module.css'

export interface ContextBarProps {
  projectName: string
  branch: string | null
}

/**
 * 输入框上方的上下文条。
 * 仅在空状态出现——截图 1 的对话进行中并没有这一条。
 */
export function ContextBar({ projectName, branch }: ContextBarProps) {
  return (
    <div className={styles.bar}>
      <ProjectPicker projectName={projectName} />
      <WorkModePicker />
      {branch && <BranchPicker branch={branch} />}
    </div>
  )
}
