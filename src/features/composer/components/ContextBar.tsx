import { BranchPicker } from '@/shared/components/BranchPicker'
import { WorkModePicker } from '@/shared/components/WorkModePicker'
import { ProjectPicker } from './ProjectPicker'
import styles from './ContextBar.module.css'

export interface ContextBarProps {
  projectName: string
  branch: string | null
}

/** 新会话输入框上方的工作区工具栏。 */
export function ContextBar({ projectName, branch }: ContextBarProps) {
  return (
    <div className={styles.bar} role="group" aria-label="对话工作区">
      <WorkModePicker localLabel="此计算机" />
      <ProjectPicker projectName={projectName} />
      {branch && <BranchPicker branch={branch} compact />}
    </div>
  )
}
