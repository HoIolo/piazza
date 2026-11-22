import type { Model } from '@/rpc/types'

/**
 * pi 在「还没有可用模型」时不会报 null，而是给一个全 unknown 的占位对象。
 * 直接拿它当模型渲染，输入框下面就会空着（甚至写着 unknown），
 * 用户看起来就是「我明明加了模型，这里怎么还是空的」。
 */
export function isPlaceholderModel(model: Model | null | undefined): boolean {
  if (!model) return true
  if (!model.id || model.id === 'unknown') return true
  return model.provider === 'unknown'
}
