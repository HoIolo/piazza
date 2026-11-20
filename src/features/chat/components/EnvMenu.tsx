import { EnvIcon } from '@/design/icons'
import { Popover } from '@/design/primitives/Popover'
import { EnvInfo } from './EnvInfo'
import styles from './EnvMenu.module.css'

/**
 * 环境信息弹窗，挂在顶栏「打开位置」右侧。
 *
 * 只在主区不够宽、放不下停靠卡片时使用；够宽时同一份内容停靠在会话区右侧，
 * 顶栏上这个位置换成开关按钮（见 TopBar）。
 *
 * 内容里嵌着分支与工作模式两个下拉，浮层必须放开裁切，否则子浮层会被切掉。
 */
export function EnvMenu() {
  return (
    <Popover
      side="bottom"
      align="end"
      overflow="visible"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.trigger}
          data-open={open}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="环境信息"
          title="环境信息"
        >
          <EnvIcon />
        </button>
      )}
    >
      {() => <EnvInfo />}
    </Popover>
  )
}
