#!/usr/bin/env node
/**
 * 冒烟检查内置运行时：确认 node 能起、worker 能被 import、SDK 能解析。
 *
 * 这三件事只要有一件不成立，应用启动时就是一句「pi 进程退出」——
 * 而这三种故障都是**只在目标平台上才暴露**的（路径分隔符、平台专属依赖、
 * 打包漏文件），mac 上跑得好好的，Windows 装完就废。放进 CI 里每个平台各跑一次。
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// 一律用绝对路径：spawn 的 cwd 换掉之后，相对路径会按子进程的目录解析
const runtime = resolve('src-tauri/resources/pi-runtime')
const node = join(runtime, 'bin', process.platform === 'win32' ? 'node.exe' : 'node')
const worker = join(runtime, 'worker.mjs')

if (!existsSync(node) || !existsSync(worker)) {
  console.error(`✗ 运行时缺失：${node} 或 ${worker}`)
  process.exit(1)
}

console.log('node 版本：', execFileSync(node, ['--version'], { encoding: 'utf8' }).trim())

/** 起 worker，给它 8 秒；期间带 stderr 退出就算失败 */
function bootWorker() {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [worker], { cwd: runtime, stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    const timer = setTimeout(() => {
      child.kill()
      // 还在跑说明模块都加载成功了，正是我们要的结果
      resolve(stderr)
    }, 8000)
    child.on('error', reject)
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve(stderr)
      reject(new Error(`worker 以 ${code} 退出：\n${stderr.trim() || '(无 stderr)'}`))
    })
  })
}

const stderr = await bootWorker()
if (stderr.trim()) console.log('worker stderr：\n' + stderr.trim())
console.log('✓ 内置运行时可用')
