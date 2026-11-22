import { useChatStore } from '@/store/chat/store'
import type { PrimaryAction } from '../components/ComposerToolbar'
import { useResumeAction } from './useResumeAction'

/**
 * 主按钮此刻为什么不能按。
 *
 * 「继续」是例外：它只是让 pi 接着跑，命令可以等会话就绪再发，所以 rpcReady
 * 挡不住它。压缩中、扩展弹着对话框、附件还在读，这些才是继续也不能碰的。
 */
function blocked(notReady: boolean, busy: boolean, reading: boolean, action: PrimaryAction) {
  if (busy || reading) return true
  return notReady && action !== 'resume'
}

function disabled(action: PrimaryAction, hasText: boolean, isBlocked: boolean) {
  if (action === 'stop') return false
  return isBlocked || (action !== 'resume' && !hasText)
}

export interface PrimaryActionArgs {
  action: PrimaryAction
  hasText: boolean
  /** 附件还在从磁盘读，此刻发出会少内容 */
  reading: boolean
  submit: () => void
  abort: () => void
  resume: () => Promise<boolean>
}

/** 主按钮的三件事：能不能按、要不要转圈、按下去做什么 */
export function usePrimaryAction({
  action,
  hasText,
  reading,
  submit,
  abort,
  resume,
}: PrimaryActionArgs) {
  const notReady = useChatStore((s) => !s.rpcReady)
  const busy = useChatStore((s) => s.isCompacting || s.pendingDialog !== null)
  const resumeClick = useResumeAction(resume)

  const run = () => {
    if (action === 'stop') abort()
    else if (action === 'resume') resumeClick.run()
    else submit()
  }

  return {
    disabled: disabled(action, hasText, blocked(notReady, busy, reading, action)),
    pending: action === 'resume' && resumeClick.pending,
    run,
  }
}
