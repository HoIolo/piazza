/**
 * 已发出、但还没被 pi 回传确认的引导消息。
 *
 * 判定一条 user 消息是「引导」还是「新一轮提问」，原先靠 `isStreaming`：
 * 发送那一刻如果正在跑，就认定它是引导。这个判据依赖事件到达顺序——
 * 一旦 `agent_settled` 抢在 user 的 `message_end` 前面，isStreaming 已经落回
 * false，引导就被当成新一轮切开，界面上一句话被拆成两轮。
 *
 * 真正确定的事实只有发送侧知道：这次到底发的是 steer 还是 prompt。
 * 所以在这里记一笔，等 pi 回传同文消息时认领。按文本 + 计数匹配，
 * 用户连发两句一样的话也不会串。
 */
const pending: string[] = []

/** 记下一条已投递的引导消息 */
export function rememberSteer(text: string): void {
  pending.push(text)
}

/**
 * 认领一条引导消息：文本对得上就消费掉并返回 true。
 * 对不上（比如模板被展开过）就返回 false，由调用方退回旧判据。
 */
export function consumeSteer(text: string): boolean {
  const index = pending.indexOf(text)
  if (index === -1) return false
  pending.splice(index, 1)
  return true
}

/** 投递失败时撤回：没送到 pi 的引导不该继续等着被认领 */
export function forgetSteer(text: string): void {
  const index = pending.lastIndexOf(text)
  if (index !== -1) pending.splice(index, 1)
}

/** 会话切换/重连时清空：那些引导已经不属于新的这条会话 */
export function clearSteers(): void {
  pending.length = 0
}
