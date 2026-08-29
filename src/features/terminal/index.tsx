import { Plus, SquareTerminal, X } from 'lucide-react'
import { closeTerminal } from '@/shared/api/terminal'
import { basename } from '@/shared/utils/path'
import { useAppStore } from '@/store/app.store'
import { TerminalTab } from './components/TerminalTab'
import styles from './TerminalPanel.module.css'
import '@xterm/xterm/css/xterm.css'

/**
 * 会话区下方的终端面板。
 *
 * 每个标签是一个真实 PTY（见 src-tauri/src/terminal.rs），
 * 不是命令执行记录——提示符、颜色、vim 这类交互式程序都能正常用。
 */
export function TerminalPanel() {
  const open = useAppStore((s) => s.terminalOpen)
  const tabs = useAppStore((s) => s.terminalTabs)
  const activeId = useAppStore((s) => s.activeTerminalTab)
  const addTab = useAppStore((s) => s.addTerminalTab)
  const closeTab = useAppStore((s) => s.closeTerminalTab)

  /** 用户主动关标签：先结束 PTY，再移除标签 */
  const removeTab = (id: string) => {
    void closeTerminal(id)
    closeTab(id)
  }
  const setActive = useAppStore((s) => s.setActiveTerminalTab)
  const closePanel = useAppStore((s) => s.closeTerminal)

  /*
   * 面板常驻挂载，靠高度过渡开合——条件渲染没有收起动画，只会跳变。
   * 标签是首次打开时才创建的，所以收起状态下这里是空的，不会白起一个 PTY。
   */
  return (
    <div className={styles.panel} data-open={open} aria-hidden={!open}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <div key={tab.id} className={styles.tab} data-active={tab.id === activeId}>
            <button type="button" className={styles.tabButton} onClick={() => setActive(tab.id)}>
              <SquareTerminal size={14} className={styles.tabIcon} />
              <span className={styles.tabLabel}>{tab.cwd ? basename(tab.cwd) : 'shell'}</span>
            </button>
            <button
              type="button"
              className={styles.tabClose}
              onClick={() => removeTab(tab.id)}
              aria-label="关闭标签"
            >
              <X size={13} />
            </button>
          </div>
        ))}

        <button type="button" className={styles.add} onClick={addTab} aria-label="新建终端标签">
          <Plus size={16} />
        </button>

        <button
          type="button"
          className={styles.closePanel}
          onClick={closePanel}
          aria-label="关闭终端"
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.body}>
        {tabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            id={tab.id}
            cwd={tab.cwd}
            active={tab.id === activeId}
            onExit={closeTab}
          />
        ))}
      </div>
    </div>
  )
}
