import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card } from '@/design/primitives/Card'
import { Pill } from '@/design/primitives/Pill'
import { Row } from '@/design/primitives/Row'
import { Toggle } from '@/design/primitives/Toggle'
import {
  getCuPermissions,
  requestCuPermission,
  type CuPermissions,
} from '@/shared/api/computerUse'
import { useAppStore } from '@/store/app.store'
import { useChatStore } from '@/store/chat/store'
import type { SectionProps } from './AppearanceSection'
import styles from './ComputerUseCard.module.css'

function PermissionRow({
  title,
  description,
  granted,
  onGrant,
}: {
  title: string
  description: string
  granted: boolean
  onGrant: () => void
}) {
  return (
    <Row
      title={title}
      description={description}
      control={
        <div className={styles.statusRow}>
          <span className={styles.badge} data-granted={granted}>
            {granted ? '已授权' : '未授权'}
          </span>
          {!granted && <Pill onClick={onGrant}>去授权</Pill>}
        </div>
      }
    />
  )
}

/** 内置 Open Computer Use 开关与系统权限状态卡片 */
export function ComputerUseCard({ settings }: SectionProps) {
  const { read, update, saving } = settings
  const enabled = read('computerUse.enabled', true)
  const visualCursor = read('computerUse.visualCursor', true)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const currentCwd = useAppStore((s) => s.currentCwd)
  const reconnectSession = useAppStore((s) => s.reconnectSession)
  const pendingReconnect = useRef(false)
  const [perms, setPerms] = useState<CuPermissions | null>(null)

  const refreshPerms = useCallback(() => {
    void getCuPermissions()
      .then(setPerms)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    refreshPerms()
  }, [refreshPerms])

  useEffect(() => {
    if (saving || !pendingReconnect.current) return
    pendingReconnect.current = false
    if (!isStreaming && currentCwd) reconnectSession()
  }, [saving, isStreaming, currentCwd, reconnectSession])

  const updateAndReconnect = (key: string, value: boolean) => {
    pendingReconnect.current = true
    update(key, value)
  }

  const handleGrant = (kind: 'accessibility' | 'screen_recording') => {
    void requestCuPermission(kind)
      .then(setPerms)
      .catch(() => undefined)
  }

  return (
    <Card title="内置桌面控制（Open Computer Use）">
      <Row
        title="启用内置桌面控制"
        description="开箱内置 MCP 工具集，可在后台操作桌面应用并在右上角显示实时预览"
        control={
          <Toggle checked={enabled} onChange={(v) => updateAndReconnect('computerUse.enabled', v)} />
        }
      />
      <Row
        title="显示虚拟鼠标光标"
        description="执行点击、输入与拖拽时在目标应用上展示轻量软件光标"
        control={
          <Toggle
            checked={visualCursor}
            disabled={!enabled}
            onChange={(v) => updateAndReconnect('computerUse.visualCursor', v)}
          />
        }
      />
      {perms?.supported && (
        <>
          <PermissionRow
            title="辅助功能权限"
            description="用于读取界面控件树并向目标应用投递点击与输入"
            granted={perms.accessibility}
            onGrant={() => handleGrant('accessibility')}
          />
          <PermissionRow
            title="屏幕录制权限"
            description="用于驱动窗口录屏捕获角标与 Piazza 右上角实时操作预览"
            granted={perms.screenRecording}
            onGrant={() => handleGrant('screen_recording')}
          />
          <Row
            title="检查系统权限"
            description={
              <span className={styles.hint}>在系统设置中勾选 Piazza 后点击刷新状态</span>
            }
            control={
              <Pill icon={<RefreshCw size={12} />} onClick={refreshPerms}>
                刷新状态
              </Pill>
            }
          />
        </>
      )}
    </Card>
  )
}
