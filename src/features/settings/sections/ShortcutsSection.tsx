import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import styles from './ShortcutsSection.module.css'

/** GUI 内已实现的快捷键。首版为只读展示，不支持改键 */
const SHORTCUTS = [
  { keys: '⌘K', label: '打开命令面板' },
  { keys: '⌘,', label: '打开设置' },
  { keys: '⌘N', label: '新建对话' },
  { keys: '⌘\\', label: '切换右侧面板' },
  { keys: '⌘T', label: '切换终端' },
  { keys: '⌘P', label: '打开文件面板' },
  { keys: '⌃⇧G', label: '打开审阅面板' },
  { keys: '⌘R', label: '重载窗口' },
  { keys: 'Enter', label: '发送消息' },
  { keys: 'Shift + Enter', label: '输入框内换行' },
  { keys: 'Esc', label: '中断当前生成' },
]

export function ShortcutsSection() {
  return (
    <Card title="快捷键">
      {SHORTCUTS.map(({ keys, label }) => (
        <Row key={keys} title={label} control={<kbd className={styles.keys}>{keys}</kbd>} />
      ))}
    </Card>
  )
}
