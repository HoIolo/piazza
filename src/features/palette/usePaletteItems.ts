import { useEffect, useState } from 'react'
import { getVisibleCommands } from '@/rpc/visibleCommands'
import { rpcClient } from '@/rpc/client'
import { runRpc } from '@/store/chat'

export interface PaletteItem {
  id: string
  label: string
  hint?: string
  shortcut?: string
  run: () => void
}

/**
 * 命令面板的数据源：GUI 内置操作 + pi 提供的扩展命令 / 技能 / 提示词模板。
 * pi 侧命令通过 get_commands 拉取，执行时以 `/name` 作为 prompt 发送。
 */
export function usePaletteItems(builtins: PaletteItem[], enabled: boolean): PaletteItem[] {
  const [piItems, setPiItems] = useState<PaletteItem[]>([])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    getVisibleCommands()
      .then((data) => {
        if (cancelled) return
        setPiItems(
          (data.commands ?? []).map((command) => ({
            id: `pi:${command.name}`,
            label: `/${command.name}`,
            hint: command.description,
            run: () =>
              void runRpc(() => rpcClient.send({ type: 'prompt', message: `/${command.name}` })),
          })),
        )
      })
      // pi 未启动时拿不到命令列表，此时只展示内置项即可，不作为错误处理
      .catch(() => setPiItems([]))

    return () => {
      cancelled = true
    }
  }, [enabled])

  return [...builtins, ...piItems]
}

/** 简单的子串匹配：命令面板的候选集很小，无需模糊排序 */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return items
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(keyword) || item.hint?.toLowerCase().includes(keyword),
  )
}
