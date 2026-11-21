import { AttachButton } from './AttachMenu'
import { ContextUsageRing } from './ContextUsageRing'
import { ModelPicker } from './ModelPicker'
import { TrustPicker } from './TrustPicker'
import styles from './ComposerToolbar.module.css'

/**
 * 主按钮此刻的角色。
 *
 * 运行中框里有字就是「引导」——把这句插进当前运行；没字才是「停止」。
 * 没有单独的停止按钮：运行中输入框永远只表达「再补一句话」。真要打断，
 * 清空输入框后主按钮自己就变成停止，或者连按两下 Esc。
 */
export type PrimaryAction = 'send' | 'steer' | 'stop' | 'resume'

export interface ComposerToolbarProps {
  action: PrimaryAction
  disabled: boolean
  /** 已按过一次 Esc，再按一次才停 */
  stopArmed: boolean
  onPrimary: () => void
  /** 「+」面板是否展开 */
  attachOpen: boolean
  onToggleAttach: () => void
}

const LABELS: Record<PrimaryAction, string> = {
  send: '发送',
  steer: '引导（⌘↵ 改为排队）',
  stop: '暂停',
  resume: '继续',
}

/** 向上箭头，线段取自 Codex 发送图标：一竖两斜，线宽 1.33 */
function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 16.667V3.333M4.167 9.167 10 3.333l5.833 5.834"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 停止：11×11、圆角 1.25 的实心方块，path 与 Codex 一致 */
function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M4.5 5.75C4.5 5.05964 5.05964 4.5 5.75 4.5H14.25C14.9404 4.5 15.5 5.05964 15.5 5.75V14.25C15.5 14.9404 14.9404 15.5 14.25 15.5H5.75C5.05964 15.5 4.5 14.9404 4.5 14.25V5.75Z" />
    </svg>
  )
}

function ResumeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M6 5.4a1 1 0 0 1 1.53-.85l7.35 4.6a1 1 0 0 1 0 1.7l-7.35 4.6A1 1 0 0 1 6 14.6Z" />
    </svg>
  )
}

function PrimaryIcon({ action, stopArmed }: { action: PrimaryAction; stopArmed: boolean }) {
  if (action === 'resume') return <ResumeIcon />
  if (action !== 'stop') return <ArrowUpIcon />
  return stopArmed ? <span className={styles.escHint}>Esc</span> : <StopIcon />
}

/** 输入框底部工具条：左边是「+」，右边依次是信任级别、模型、主按钮 */
export function ComposerToolbar({
  action,
  disabled,
  stopArmed,
  onPrimary,
  attachOpen,
  onToggleAttach,
}: ComposerToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <AttachButton open={attachOpen} onToggle={onToggleAttach} />
      <TrustPicker />

      <div className={styles.right}>
        <ContextUsageRing />
        <ModelPicker />
        <button
          type="button"
          className={styles.send}
          data-action={action}
          disabled={disabled}
          onClick={onPrimary}
          aria-label={LABELS[action]}
          title={LABELS[action]}
        >
          <PrimaryIcon action={action} stopArmed={stopArmed} />
        </button>
      </div>
    </div>
  )
}
