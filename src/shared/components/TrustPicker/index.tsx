import { CircleAlert, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { MenuItem } from '@/design/primitives/MenuList'
import { Popover } from '@/design/primitives/Popover'
import { TRUST_OPTIONS, useProjectTrust, type TrustLevel } from '@/shared/hooks/useProjectTrust'
import styles from './TrustPicker.module.css'

const ICONS: Record<TrustLevel, typeof CircleAlert> = {
  ask: ShieldQuestion,
  always: CircleAlert,
  never: ShieldCheck,
}

/**
 * 项目信任级别选择器。
 *
 * 占据 Codex 中「完全访问」标签的位置，但换成 pi 真实存在的设置——
 * pi 没有操作级审批，只有「是否加载项目本地配置」这一档。
 */
export function TrustPicker() {
  const { level, change } = useProjectTrust()
  const current = TRUST_OPTIONS.find((o) => o.value === level) ?? TRUST_OPTIONS[0]
  const Icon = ICONS[level]

  return (
    <Popover
      trigger={({ toggle, open }) => (
        <button
          type="button"
          className={styles.trigger}
          data-level={level}
          data-open={open}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          /* 窄宽度下文字会被容器查询隐藏，aria-label 保证读屏仍能读出当前档位 */
          aria-label={`项目信任：${current.label}`}
          title={`项目信任：${current.label}`}
        >
          <Icon size={15} />
          <span className={styles.text}>{current.label}</span>
        </button>
      )}
    >
      {(close) => (
        <div className={styles.panel}>
          <div className={styles.head}>项目信任</div>
          {TRUST_OPTIONS.map((option) => (
            <MenuItem
              key={option.value}
              selected={option.value === level}
              onClick={() => {
                change(option.value)
                close()
              }}
            >
              <span className={styles.label}>{option.label}</span>
              <span className={styles.desc}>{option.description}</span>
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  )
}
