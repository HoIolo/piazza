/*
 * 量 pi worker 的冷启动耗时，并按阶段拆开。
 *
 * 只量「首个 response 到达」，不往 worker 里插桩——插桩要改随包发布的文件，
 * 那份文件是从 pi SDK 仓库同步来的，改动会在下次同步时丢失。
 * 阶段拆分见下方注释里的实测数字，需要复测时临时插桩即可。
 * 跑法：node scripts/measure-boot.mjs [worker 所在目录]
 *
 * 现状（M 系 Mac，内置 node v22.22.3）：
 *   SDK barrel import   ~500ms   ← 主要瓶颈
 *   ├ extensions/index  ~304ms   ← 静态拉入 llama → pi-tui → modes/interactive
 *   ├ http-dispatcher    ~51ms
 *   └ project-trust      ~31ms
 *   真实会话创建          ~106ms
 *   首个 response         ~570ms
 */
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const dir = process.argv[2] ?? join(root, 'src-tauri/resources/pi-runtime')
const node = join(dir, 'bin/node')
const worker = join(dir, 'worker.mjs')

/** 起一个 worker，量「首个 response 到达」与 worker 自己打的阶段点 */
function runOnce(agentDir) {
  return new Promise((done) => {
    const t0 = Date.now()
    const child = spawn(node, [worker], {
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = ''
    child.stderr.on('data', () => undefined)
    child.stdout.on('data', (b) => {
      out += b.toString()
      if (!out.includes('"type":"response"')) return
      child.kill()
      done({ firstResponseMs: Date.now() - t0 })
    })
    child.stdin.write(JSON.stringify({ type: 'get_state', id: '1' }) + '\n')
    setTimeout(() => {
      child.kill()
      done({ firstResponseMs: -1 })
    }, 15_000)
  })
}

const runs = []
for (let i = 0; i < 3; i += 1) runs.push(await runOnce(process.env.HOME + '/.piazza/agent'))
const mean = Math.round(runs.reduce((a, r) => a + r.firstResponseMs, 0) / runs.length)
console.log(JSON.stringify({ 三轮首响应: runs.map((r) => r.firstResponseMs), 均值: mean }, null, 2))
