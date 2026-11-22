import { useCallback, useEffect, useState } from 'react'
import { readAppSettings, writeAppSettings } from '@/shared/api/config'
import { useAppStore } from '@/store/app.store'

export type TrustLevel = 'ask' | 'always' | 'never'

export const TRUST_OPTIONS: Array<{ value: TrustLevel; label: string; description: string }> = [
  {
    value: 'ask',
    label: '每次询问',
    description: '打开含本地配置的项目时先询问',
  },
  {
    value: 'always',
    label: '始终信任',
    description: '自动加载项目下的扩展、技能与提示词',
  },
  {
    value: 'never',
    label: '从不信任',
    description: '忽略所有项目本地配置',
  },
]

/**
 * pi 的项目信任级别（settings.json 的 defaultProjectTrust）。
 *
 * 这是 pi 里最接近 Codex「审批模式」的概念，但含义不同：它控制的是
 * 是否加载项目本地的扩展/技能，而非逐次操作审批——pi 没有内置沙箱，
 * 也不做操作级审批。
 */
export function useProjectTrust() {
  const [level, setLevel] = useState<TrustLevel>('ask')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    readAppSettings()
      .then((settings) => {
        const value = settings.defaultProjectTrust
        if (!cancelled && typeof value === 'string') setLevel(value as TrustLevel)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const change = useCallback(
    (next: TrustLevel) => {
      const previous = level
      setLevel(next)
      setSaving(true)
      // 读回最新再写，避免覆盖设置窗口里同时做的其它修改
      readAppSettings()
        .then((settings) => writeAppSettings({ ...settings, defaultProjectTrust: next }))
        .then(() => {
          /*
           * 必须重启 pi 才生效。
           *
           * 档位是 pi 启动时读的，进程活着就不会再读 settings.json——实证过：
           * 改成 always 再切会话，项目扩展依旧不加载。所以这里主动重连一次，
           * 让新进程带着新档位起来。切档位本来就意味着「换一套加载策略」，
           * 重启一次是可以接受的代价；不重启则设置形同虚设。
           */
          if (next !== previous) useAppStore.getState().reconnectSession()
        })
        .catch(() => undefined)
        .finally(() => setSaving(false))
    },
    [level],
  )

  return { level, change, saving }
}
