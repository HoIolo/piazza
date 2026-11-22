import { useEffect, useState } from 'react'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { listExternalApps, openPathWith, type ExternalApp } from '@/shared/api/pi'
import { readPathKind, type PathKind } from '@/shared/api/pathKind'
import { readAnyFile } from '@/shared/api/files'
import type { FileTarget } from './fileTarget'

/**
 * 文件链接菜单的动作与状态。
 *
 * 抽出来是为了让菜单组件只负责摆放与渲染：查类型、列应用、复制、打开
 * 这几件事各自都有失败分支，堆在 JSX 里会把组件撑过行数上限。
 */
export function useFileActions(target: FileTarget, onDone: () => void) {
  const [kind, setKind] = useState<PathKind | null>(null)
  const [apps, setApps] = useState<ExternalApp[]>([])
  const [flash, setFlash] = useState('')

  useEffect(() => {
    let active = true
    void readPathKind(target.path).then((value) => active && setKind(value))
    void listExternalApps().then((list) => active && setApps(list))
    return () => {
      active = false
    }
  }, [target.path])

  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setFlash(what)
      // 留一点时间让用户看到「已复制」，再收起菜单
      setTimeout(onDone, 420)
    })
  }

  return {
    kind,
    apps,
    flash,
    missing: kind === 'missing',
    copyPath: () => copy(target.path, 'path'),
    copyContents: () => {
      void readAnyFile(target.path).then((text) => copy(text, 'contents'))
    },
    reveal: () => {
      void revealItemInDir(target.path)
      onDone()
    },
    openWith: (appPath: string) => {
      void openPathWith(appPath, target.path)
      onDone()
    },
  }
}
