import { CornerDownRight } from 'lucide-react'
import styles from './ExchangeGroup.module.css'

/**
 * 运行中打进去的引导。它是这一轮里的一步，不是新一轮：
 * 跟终端输出排在同一列，一轮跑完一起收起来。
 */
export function SteeredNote({ text }: { text: string }) {
  return (
    <p className={styles.steered}>
      <CornerDownRight size={12} className={styles.steeredIcon} aria-hidden />
      <span className={styles.steeredText}>{text}</span>
    </p>
  )
}
