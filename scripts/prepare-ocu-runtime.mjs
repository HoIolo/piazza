#!/usr/bin/env node
/**
 * 把 Open Computer Use 原生运行时、REPL 适配器、Piazza 代理/遥测分流器
 * 以及 macOS 悬浮角标/ScreenCaptureKit 助手编进 `src-tauri/resources/ocu-runtime`。
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
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OCU_VERSION = '1.1.6'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'src-tauri/resources/ocu-runtime')
const helperSrc = join(root, 'src-tauri/macos/OcuOverlayHelper.swift')
const overlaySources = ['proxy.mjs', 'telemetry-tap.mjs']
const pluginScripts = [
  'open-computer-use-repl.mjs',
  'open-computer-use-kernel.mjs',
  'ocu-config.mjs',
]

function targetPlatform() {
  const triple = process.env.TAURI_ENV_TARGET_TRIPLE
  if (triple === 'universal-apple-darwin') return { os: 'darwin', arch: 'universal', triple }
  if (triple) {
    const arch = triple.startsWith('aarch64') ? 'arm64' : 'x64'
    if (triple.includes('apple-darwin')) return { os: 'darwin', arch, triple }
    if (triple.includes('windows')) return { os: 'win32', arch, triple }
    return { os: 'linux', arch, triple }
  }
  return { os: process.platform, arch: process.arch, triple: `${process.platform}-${process.arch}` }
}

function findInstalledPackage() {
  const candidates = []
  if (process.env.OCU_PACKAGE_DIR) candidates.push(process.env.OCU_PACKAGE_DIR)

  const nvmDir = process.env.NVM_DIR || join(homedir(), '.nvm')
  const nvmVersions = join(nvmDir, 'versions/node')
  if (existsSync(nvmVersions)) {
    const versions = readdirSync(nvmVersions).sort().reverse()
    for (const v of versions) {
      candidates.push(join(nvmVersions, v, 'lib/node_modules/open-computer-use'))
    }
  }

  candidates.push(
    '/opt/homebrew/lib/node_modules/open-computer-use',
    '/usr/local/lib/node_modules/open-computer-use',
  )

  for (const dir of candidates) {
    if (dir && existsSync(join(dir, 'package.json'))) return dir
  }

  try {
    const npmRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    const pkgDir = join(npmRoot, 'open-computer-use')
    if (existsSync(join(pkgDir, 'package.json'))) return pkgDir
  } catch {
    // 继续尝试兜底安装
  }

  return null
}

function installTempPackage(stage) {
  const prefix = join(stage, 'npm-pkg')
  mkdirSync(prefix, { recursive: true })
  execFileSync(
    'npm',
    ['install', '--prefix', prefix, '--no-save', '--no-audit', '--no-fund', `open-computer-use@${OCU_VERSION}`],
    { stdio: 'inherit' },
  )
  return process.platform === 'win32'
    ? join(prefix, 'node_modules/open-computer-use')
    : join(prefix, 'lib/node_modules/open-computer-use')
}

function compileDarwinHelper(runtimeDir, arch) {
  const outBin = join(runtimeDir, 'ocu-overlay-helper')
  const frameworks = [
    '-framework', 'AppKit',
    '-framework', 'ApplicationServices',
    '-framework', 'CoreImage',
    '-framework', 'CoreMedia',
    '-framework', 'ImageIO',
    '-framework', 'QuartzCore',
    '-framework', 'ScreenCaptureKit',
    '-framework', 'UniformTypeIdentifiers',
  ]
  if (arch === 'universal') {
    const armBin = `${outBin}.arm64`
    const x64Bin = `${outBin}.x64`
    execFileSync(
      'swiftc',
      ['-swift-version', '5', '-O', '-target', 'arm64-apple-macosx13.0', helperSrc, '-o', armBin, ...frameworks],
      { stdio: 'inherit' },
    )
    execFileSync(
      'swiftc',
      ['-swift-version', '5', '-O', '-target', 'x86_64-apple-macosx13.0', helperSrc, '-o', x64Bin, ...frameworks],
      { stdio: 'inherit' },
    )
    execFileSync('lipo', ['-create', armBin, x64Bin, '-output', outBin], { stdio: 'inherit' })
    rmSync(armBin, { force: true })
    rmSync(x64Bin, { force: true })
  } else {
    const target = arch === 'x64' ? 'x86_64-apple-macosx13.0' : 'arm64-apple-macosx13.0'
    execFileSync(
      'swiftc',
      ['-swift-version', '5', '-O', '-target', target, helperSrc, '-o', outBin, ...frameworks],
      { stdio: 'inherit' },
    )
  }
  chmodSync(outBin, 0o755)
}

function computeStamp(target, pkgVersion) {
  const h = createHash('sha256')
  h.update(readFileSync(fileURLToPath(import.meta.url)))
  for (const name of overlaySources) {
    h.update(readFileSync(join(root, 'ocu-runtime', name)))
  }
  if (target.os === 'darwin' && existsSync(helperSrc)) {
    h.update(readFileSync(helperSrc))
  }
  return `${target.triple} ${pkgVersion} ${h.digest('hex')}`
}

function main() {
  const target = targetPlatform()
  mkdirSync(join(root, 'src-tauri/target'), { recursive: true })
  const stage = mkdtempSync(join(root, 'src-tauri/target', 'ocu-runtime-'))

  try {
    const pkgDir = findInstalledPackage() ?? installTempPackage(stage)
    const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    const stamp = computeStamp(target, pkgJson.version ?? OCU_VERSION)

    const ready = join(output, '.ready')
    const helperReady = target.os !== 'darwin' || existsSync(join(output, 'ocu-overlay-helper'))
    if (helperReady && existsSync(ready) && readFileSync(ready, 'utf8').trim() === stamp) {
      return
    }

    const runtime = join(stage, 'runtime')
    mkdirSync(runtime, { recursive: true })

    for (const name of pluginScripts) {
      copyFileSync(
        join(pkgDir, 'plugins/open-computer-use/scripts', name),
        join(runtime, name),
      )
    }
    for (const name of overlaySources) {
      copyFileSync(join(root, 'ocu-runtime', name), join(runtime, name))
    }

    if (target.os === 'darwin') {
      cpSync(join(pkgDir, 'dist/Open Computer Use.app'), join(runtime, 'Open Computer Use.app'), {
        recursive: true,
      })
      compileDarwinHelper(runtime, target.arch)
    } else if (target.os === 'win32') {
      const archDir = target.arch === 'arm64' ? 'arm64' : 'x64'
      cpSync(join(pkgDir, 'dist/windows', archDir), join(runtime, 'windows', archDir), {
        recursive: true,
      })
    } else {
      const archDir = target.arch === 'arm64' ? 'arm64' : 'x64'
      cpSync(join(pkgDir, 'dist/linux', archDir), join(runtime, 'linux', archDir), {
        recursive: true,
      })
    }

    writeFileSync(join(runtime, '.ready'), `${stamp}\n`)
    if (existsSync(output)) renameSync(output, join(stage, 'previous-runtime'))
    try {
      renameSync(runtime, output)
    } catch (error) {
      if (existsSync(join(stage, 'previous-runtime'))) {
        renameSync(join(stage, 'previous-runtime'), output)
      }
      throw error
    }
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}

main()
