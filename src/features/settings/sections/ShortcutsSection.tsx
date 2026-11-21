import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import styles from './ShortcutsSection.module.css'

const GROUPS = [
  {
    title: '通用与导航',
    items: [
      { keys: '⌘K', label: '打开命令面板' },
      { keys: '⌘,', label: '打开设置' },
      { keys: '⌘N', label: '新建对话' },
      { keys: '⌘R', label: '重载窗口' },
    ],
  },
  {
    title: '聊天与输入',
    items: [
      { keys: 'Enter', label: '发送消息（生成中为引导）' },
      { keys: '⌘ + Enter', label: '生成中追加到排队列表' },
      { keys: 'Shift + Enter', label: '输入框内换行' },
      { keys: 'Esc', label: '中断当前生成（连按两次立即停止）' },
    ],
  },
  {
    title: '工作区面板',
    items: [
      { keys: '⌘\\', label: '切换右侧工作区面板' },
      { keys: '⌘T', label: '切换底部内置终端' },
      { keys: '⌘P', label: '打开文件浏览器' },
      { keys: '⌃⇧G', label: '打开代码审阅面板' },
    ],
  },
] as const

export function ShortcutsSection() {
  return (
    <>
      {GROUPS.map((group) => (
        <Card key={group.title} title={group.title}>
          {group.items.map(({ keys, label }) => (
            <Row key={keys} title={label} control={<kbd className={styles.keys}>{keys}</kbd>} />
          ))}
        </Card>
      ))}
    </>
  )
}
