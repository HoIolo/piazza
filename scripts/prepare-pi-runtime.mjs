#!/usr/bin/env node
/**
 * 把 Node + pi SDK 装进 `src-tauri/resources/pi-runtime`，随安装包一起分发。
 *
 * 原来的 .sh 版本只认 macOS：写死 darwin 的 tarball、用 shasum 校验、给 npm/npx
 * 生成 sh 包装脚本。Windows 上这些都不存在，所以整段改成 Node 脚本——两个平台
 * 的 CI runner 都自带 node 和 bsdtar（`tar` 能直接解 xz 和 zip）。
 *
 * universal 构建（--target universal-apple-darwin）需要一份既能在 Intel 又能在
 * Apple Silicon 上跑的 node，用 lipo 把两个官方二进制拼起来即可；pi SDK 的原生
 * 依赖是按 process.arch 在运行时挑 prebuilds 的，拼过的 node 照样能选对。
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NODE_VERSION = '22.22.3'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'src-tauri/resources/pi-runtime')
const runtimeSources = [
  'package.json',
  'package-lock.json',
  'worker.mjs',
  'accounts.mjs',
  'title.mjs',
  'resume.mjs',
  'context-window.mjs',
]

/** Tauri 传进来的目标三元组；本地 `npm run tauri dev` 时退回宿主机。 */
function targets() {
  const triple = process.env.TAURI_ENV_TARGET_TRIPLE
  if (triple === 'universal-apple-darwin') return ['darwin-arm64', 'darwin-x64']
  if (triple) {
    const arch = triple.startsWith('aarch64') ? 'arm64' : 'x64'
    if (triple.includes('apple-darwin')) return [`darwin-${arch}`]
    if (triple.includes('windows')) return [`win-${arch}`]
    throw new Error(`不支持的目标平台：${triple}`)
  }
  const platform = process.platform === 'win32' ? 'win' : process.platform
  const host = `${platform}-${process.arch}`
  if (!['darwin-arm64', 'darwin-x64', 'win-x64', 'win-arm64'].includes(host)) {
    throw new Error(`不支持的本机平台：${host}`)
  }
  return [host]
}

const archiveName = (target) =>
  `node-v${NODE_VERSION}-${target}.${target.startsWith('win') ? 'zip' : 'tar.xz'}`

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`下载失败 ${url}：${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** 官方 SHASUMS256.txt 里查校验和，比写死一堆哈希好维护，也不弱化供应链校验。 */
async function expectedSum(archive) {
  const res = await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`)
  if (!res.ok) throw new Error(`无法获取 SHASUMS256.txt：${res.status}`)
  for (const line of (await res.text()).split('\n')) {
    const [sum, name] = line.trim().split(/\s+/)
    if (name === archive) return sum
  }
  throw new Error(`SHASUMS256.txt 里没有 ${archive}`)
}

function extract(archive, dest) {
  // bsdtar：macOS 自带，Windows 10+ 自带，zip 和 tar.xz 都能解
  execFileSync('tar', ['-xf', archive, '-C', dest], { stdio: 'inherit' })
}

/** POSIX 的 npm/npx 包装脚本；Windows 用 .cmd，直接 call node.exe */
function writeLaunchers(bin, isWin) {
  for (const name of ['npm', 'npx']) {
    if (isWin) {
      const cmd = `@ECHO off\r\n"%~dp0node.exe" "%~dp0..\\lib\\npm\\bin\\${name}-cli.js" %*\r\n`
      writeFileSync(join(bin, `${name}.cmd`), cmd)
      continue
    }
    const sh = `#!/bin/sh\nbin_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$bin_dir/node" "$bin_dir/../lib/npm/bin/${name}-cli.js" "$@"\n`
    writeFileSync(join(bin, name), sh)
    chmodSync(join(bin, name), 0o755)
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 把装好的 runtime 摆到最终位置。
 *
 * POSIX 上一次 rename 就完事且是原子的；Windows 上目录常被杀软/索引器
 * 短暂占住，rename 会抛 EPERM，所以先重试几次，实在不行退回整目录复制。
 */
async function publish(runtime, output, stage) {
  const backup = join(stage, 'previous-runtime')
  if (existsSync(output)) {
    try {
      renameSync(output, backup)
    } catch {
      // 备份不动就先留着，下面 rm 兜底
    }
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      rmSync(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      renameSync(runtime, output)
      return
    } catch (error) {
      if (attempt >= 5) {
        console.warn(`重命名失败（${error.code ?? error.message}），改为复制`)
        cpSync(runtime, output, { recursive: true })
        return
      }
      await sleep(400 * (attempt + 1))
    }
  }
}

async function main() {
  const wanted = targets()
  // 脚本本身 + 运行时源码 + 目标平台一起决定「要不要重装」，
  // 任一改动都让 stamp 变化，避免用上陈旧的打包产物
  const stampSource = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url)))
  for (const name of runtimeSources)
    stampSource.update(readFileSync(join(root, 'pi-runtime', name)))
  const stamp = `${wanted.join('+')} ${NODE_VERSION} ${stampSource.digest('hex')}`

  const nodeName = wanted[0].startsWith('win') ? 'node.exe' : 'node'
  const ready = join(output, '.ready')
  if (
    existsSync(join(output, 'bin', nodeName)) &&
    existsSync(ready) &&
    readFileSync(ready, 'utf8').trim() === stamp
  ) {
    return
  }

  mkdirSync(join(root, 'src-tauri/target'), { recursive: true })
  const stage = mkdtempSync(join(root, 'src-tauri/target', 'pi-runtime-'))
  try {
    const runtime = join(stage, 'runtime')
    const bin = join(runtime, 'bin')
    mkdirSync(bin, { recursive: true })
    mkdirSync(join(runtime, 'lib'), { recursive: true })

    for (const target of wanted) {
      const archive = archiveName(target)
      const file = join(stage, archive)
      await download(`https://nodejs.org/dist/v${NODE_VERSION}/${archive}`, file)
      const actual = sha256(file)
      const expected = await expectedSum(archive)
      if (actual !== expected) throw new Error(`${archive} 校验失败：${actual} ≠ ${expected}`)
      extract(file, stage)
    }

    const isWin = wanted[0].startsWith('win')
    const unpacked = wanted.map((t) => join(stage, `node-v${NODE_VERSION}-${t}`))
    if (unpacked.length === 2) {
      execFileSync(
        'lipo',
        ['-create', ...unpacked.map((d) => join(d, 'bin/node')), '-output', join(bin, 'node')],
        {
          stdio: 'inherit',
        },
      )
      chmodSync(join(bin, 'node'), 0o755)
    } else {
      copyFileSync(join(unpacked[0], isWin ? 'node.exe' : 'bin/node'), join(bin, nodeName))
    }
    copyFileSync(join(unpacked[0], 'LICENSE'), join(runtime, 'NODE-LICENSE'))
    cpSync(
      join(unpacked[0], isWin ? 'node_modules/npm' : 'lib/node_modules/npm'),
      join(runtime, 'lib/node_modules/npm'),
      {
        recursive: true,
      },
    )
    writeLaunchers(bin, isWin)

    for (const name of runtimeSources) {
      copyFileSync(join(root, 'pi-runtime', name), join(runtime, name))
    }

    // npm 只用这一次来装 pi SDK，装完就留在包里给扩展用
    execFileSync(
      join(bin, nodeName),
      [
        join(runtime, 'lib/node_modules/npm/bin/npm-cli.js'),
        'ci',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
      ],
      {
        cwd: runtime,
        stdio: 'inherit',
        env: {
          ...process.env,
          PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
        },
      },
    )

    writeFileSync(join(runtime, '.ready'), `${stamp}\n`)
    if (existsSync(output)) renameSync(output, join(stage, 'previous-runtime'))
    try {
      renameSync(runtime, output)
    } catch (error) {
      if (existsSync(join(stage, 'previous-runtime')))
        renameSync(join(stage, 'previous-runtime'), output)
      throw error
    }
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

await main()
