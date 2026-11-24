import { useEffect, useState } from 'react'
import { Card } from '@/design/primitives/Card'
import { Row } from '@/design/primitives/Row'
import { Select } from '@/design/primitives/Select'
import { listShells, type ShellOption } from '@/shared/api/config'
import { currentPlatform } from '@/shared/utils/platform'
import type { SectionProps } from './AppearanceSection'
import styles from './SystemSection.module.css'

/** 用户自己填了路径（不是探测出来的任何一个）时，下拉里用这个值占位 */
const CUSTOM = '__custom__'

/**
 * 路径比较：Windows 不区分大小写，两种分隔符也都可能出现在配置里。
 *
 * 不这么比的话，用户手写的 `D:/x/bash.exe` 与探测出的 `D:\x\bash.exe`
 * 会被当成两个不同的值，下拉框就会错误地跳到「自定义路径」。
 */
function samePath(a: string, b: string): boolean {
  return a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()
}

interface View {
  /** 下拉框当前该显示哪个值 */
  value: string
  options: Array<{ value: string; label: string }>
  note: string
  showPath: boolean
  showAdvice: boolean
}

/** 下拉框该显示哪个值：已保存的那个，没保存就用探测到的第一个 */
function pickValue(saved: string, detected: ShellOption[]): string {
  if (!saved) return detected[0]?.path ?? ''
  return detected.some((o) => samePath(o.path, saved)) ? saved : CUSTOM
}

/** 描述行那句话：先说探测是否成功，再说这个选择的来历 */
function describeNote(matched: ShellOption | undefined, saved: string, failed: boolean): string {
  if (failed) return '探测失败，请手动填写路径'
  if (matched) return matched.note
  return saved ? '当前是手动指定的路径' : '未设置，pi 会自己探测'
}

/** 把「探测结果 + 已保存的值」摊成界面要的几样东西 */
function describe(saved: string, detected: ShellOption[], failed: boolean): View {
  const matched = detected.find((o) => samePath(o.path, saved))
  const value = pickValue(saved, detected)
  const options = detected.map((o) => ({ value: o.path, label: o.label }))
  if (value === CUSTOM) options.push({ value: CUSTOM, label: '自定义路径' })
  return {
    value,
    options,
    note: describeNote(matched, saved, failed),
    showPath: value === CUSTOM,
    // 只有确实在用 Git Bash、且机器上也有 WSL 时才解释这个取舍
    showAdvice: matched?.kind === 'git-bash' && detected.some((o) => o.kind === 'wsl'),
  }
}

/**
 * 终端 Shell 选择。
 *
 * 这件事值得单独一个卡片，因为选错不是「慢一点」，而是差十几倍：Windows 上
 * Git Bash 走 Win32 API，WSL 的 bash 要经 9p 协议跨虚拟机访问 /mnt/c，同一个
 * 目录的递归搜索能差出十几秒。pi 自己的探测顺序又只认 Program Files，Git 装在
 * D 盘或 Scoop 里就会静默落到 WSL bash 上——用户完全看不出发生了什么。
 *
 * 所以这里做三件事：把探测结果摆出来、标明各自代价、改完立刻重启 pi 生效。
 */
export function ShellCard({ settings }: SectionProps) {
  const { read, update } = settings
  const saved = read('shellPath', '') as string
  const [detected, setDetected] = useState<ShellOption[]>([])
  const [failed, setFailed] = useState(false)
  // macOS 和 Linux 上系统只有一个 shell，pi 自己解析得到，没得选也就没得显示
  const selectable = currentPlatform() === 'windows'

  useEffect(() => {
    if (!selectable) return
    void listShells()
      .then(setDetected)
      .catch(() => setFailed(true))
  }, [selectable])

  if (!selectable) return null

  const view = describe(saved, detected, failed)

  return (
    <Card title="终端 Shell">
      <Row
        title="执行命令用的 Shell"
        description={
          <>
            {view.note}
            {view.showPath && <code className={styles.pathCode}>{saved}</code>}
          </>
        }
        control={
          <Select
            value={view.value}
            options={view.options}
            ariaLabel="终端 Shell"
            onChange={(next) => {
              if (next !== CUSTOM) update('shellPath', next)
            }}
          />
        }
      />
      {view.showAdvice && (
        <Row
          title="为什么推荐 Git Bash"
          description="WSL 访问 C:、D: 盘要跨虚拟机，同一个目录的搜索、git 操作都会慢十几倍；项目本身在 WSL 文件系统里时才值得换过去。"
        />
      )}
    </Card>
  )
}
