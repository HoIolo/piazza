#!/usr/bin/env node
/**
 * 汇总各平台构建产物，生成 updater 要读的 latest.json。
 *
 * 为什么要单独一步：mac 和 win 是两个矩阵 job 并行跑，各自都会写一份
 * latest.json，后跑的会把先跑的覆盖掉——最后总有平台收不到更新。
 * 这里等两边都传完，一次性读全部资源生成唯一的一份。
 *
 * 依赖 gh CLI（runner 自带，用 GITHUB_TOKEN 认证）。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tag = process.env.TAG || process.env.GITHUB_REF_NAME
const repo = process.env.GITHUB_REPOSITORY
if (!tag || !repo) throw new Error('需要 TAG 与 GITHUB_REPOSITORY')

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' })

const assets = JSON.parse(gh('release', 'view', tag, '--repo', repo, '--json', 'assets')).assets
const version = tag.replace(/^v/, '')
const download = (name) => `https://github.com/${repo}/releases/download/${tag}/${name}`

/** 拉一份 .sig 的内容（签名是纯文本，里面就是 base64 的签名串） */
function signatureOf(name) {
  const dir = process.env.RUNNER_TEMP || tmpdir()
  execFileSync('gh', [
    'release',
    'download',
    tag,
    '--repo',
    repo,
    '--pattern',
    name,
    '--dir',
    dir,
    '--clobber',
  ])
  return readFileSync(join(dir, name), 'utf8').trim()
}

const platforms = {}
for (const asset of assets) {
  const name = asset.name
  if (!name.endsWith('.sig')) continue
  const payload = name.slice(0, -4)
  if (!assets.some((a) => a.name === payload)) continue

  if (payload.endsWith('.app.tar.gz')) {
    // universal 构建一份包同时供两个架构的 mac 用
    for (const arch of ['darwin-aarch64', 'darwin-x86_64']) {
      platforms[arch] = { signature: signatureOf(name), url: download(payload) }
    }
  } else if (payload.endsWith('.nsis.zip') || payload.endsWith('-setup.exe')) {
    platforms['windows-x86_64'] = { signature: signatureOf(name), url: download(payload) }
  }
}

if (Object.keys(platforms).length === 0) throw new Error('没有找到任何更新包签名')

const latest = {
  version,
  notes: process.env.RELEASE_NOTES || `Piazza ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
}
writeFileSync('latest.json', `${JSON.stringify(latest, null, 2)}\n`)
execFileSync('gh', ['release', 'upload', tag, 'latest.json', '--repo', repo, '--clobber'], {
  stdio: 'inherit',
})
console.log(`latest.json 已更新：${Object.keys(platforms).join(', ')}`)
