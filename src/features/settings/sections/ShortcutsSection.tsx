import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { isMac, shortcut } from '@/shared/utils/platform'
import styles from './ShortcutsSection.module.css'

/**
 * 快捷键列表。键位文案按平台生成——Windows 上没有 ⌘，
 * 写死成 ⌘ 的表格等于告诉用户「这些键你按不出来」。
 */
function buildGroups() {
  const plus = isMac() ? '⌘ + Enter' : 'Ctrl + Enter'
  return [
    {
      title: '通用与导航',
      items: [
        { keys: shortcut('K'), label: '打开命令面板' },
        { keys: shortcut(','), label: '打开设置' },
        { keys: shortcut('N'), label: '新建对话' },
        { keys: shortcut('O'), label: '添加项目' },
        { keys: shortcut('R'), label: '重载窗口' },
      ],
    },
    {
      title: '聊天与输入',
      items: [
        { keys: 'Enter', label: '发送消息（生成中为引导）' },
        { keys: plus, label: '生成中追加到排队列表' },
        { keys: 'Shift + Enter', label: '输入框内换行' },
        { keys: 'Esc', label: '中断当前生成（连按两次立即停止）' },
      ],
    },
    {
      title: '工作区面板',
      items: [
        { keys: shortcut('\\'), label: '切换右侧工作区面板' },
        { keys: shortcut('T'), label: '切换底部内置终端' },
        { keys: shortcut('P'), label: '打开文件浏览器' },
        // 审阅面板走的是 Control+Shift+G，不跟着 ⌘ 变
        { keys: isMac() ? '⌃⇧G' : 'Ctrl + Shift + G', label: '打开代码审阅面板' },
      ],
    },
  ]
}

export function ShortcutsSection() {
  return (
    <>
      {buildGroups().map((group) => (
        <Card key={group.title} title={group.title}>
          {group.items.map(({ keys, label }) => (
            <Row key={label} title={label} control={<kbd className={styles.keys}>{keys}</kbd>} />
          ))}
        </Card>
      ))}
    </>
  )
}
