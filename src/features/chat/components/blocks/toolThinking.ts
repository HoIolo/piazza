import type { ToolExecution } from '@/store/chat'

/**
 * 这一行此刻显示的是不是纯「正在思考」。
 *
 * 只有这种情况不画图标：Codex 的 activity header 在 between-tools 阶段
 * 拿不到 iconItem，图标槽位宽度直接收成 0（见其 eE() 里 `h = null` 那条分支）。
 * 有工具在跑时才有图标可画——图标代表的是「正在做的那件事」，
 * 单挂一个「正在思考」时它什么也没指代，只剩噪音。
 */
export function isThinkingOnly(executions: ToolExecution[], thinking: string | null): boolean {
  return thinking !== null && !executions.some((e) => e.status === 'running')
}
