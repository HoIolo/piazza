// 内置 ocu-mcp 外层代理：
// 1) 在 `tools/list` 与 `initialize` 响应里注入省 token 的 query 引导（不改上游包）
// 2) 宿主关 stdio 时干净回收子进程，避免僵尸进程
// 3) 转发 js_reset 通知到 telemetry 通道

import { spawn } from 'node:child_process'
import net from 'node:net'
import readline from 'node:readline'

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('ocu-mcp-proxy: 缺少要包装的命令')
  process.exit(1)
}

const SIZE_GUIDANCE = [
  'Context budget: prefer app.query({ text, role }) for targeted lookups — it returns a bounded match list instead of the whole tree.',
  'Use getAXState() with no options only when you need the full window once; on large Electron apps it can be tens of kilobytes.',
  'After a successful deterministic action you can skip the re-read when the next step does not depend on the result, or narrow it with getAXState({ maxTreeNodes, maxTreeDepth, textLimit }).',
  'Actions accept the index from the most recent snapshot or query; if an action reports that an element lost its identity, re-query instead of re-reading the whole tree.',
].join(' ')

const INSTRUCTIONS_GUIDANCE =
  ' Prefer app.query({ text, role }) over a full getAXState() when you know what you are looking for; keep full reads for orientation.'

function rewriteText(value) {
  if (typeof value !== 'string' || value.includes('Context budget:')) return value
  return `${value} ${SIZE_GUIDANCE}`
}

function rewriteMessage(message) {
  const result = message?.result
  if (!result) return message

  if (Array.isArray(result.tools)) {
    return {
      ...message,
      result: {
        ...result,
        tools: result.tools.map((tool) =>
          tool?.name === 'js' ? { ...tool, description: rewriteText(tool.description) } : tool,
        ),
      },
    }
  }

  if (typeof result.instructions === 'string') {
    return {
      ...message,
      result: { ...result, instructions: result.instructions + INSTRUCTIONS_GUIDANCE },
    }
  }

  return message
}

const telemetryPort = Number(process.env.PIAZZA_OCU_EVENT_PORT || 0)
const telemetryToken = process.env.PIAZZA_OCU_EVENT_TOKEN || ''

function sendTelemetry(payload) {
  if (!telemetryPort) return
  try {
    const socket = net.createConnection({ host: '127.0.0.1', port: telemetryPort })
    socket.on('error', () => undefined)
    socket.on('connect', () => {
      socket.end(JSON.stringify({ token: telemetryToken, ...payload }) + '\n')
    })
    socket.unref()
  } catch {
    // 遥测通道不可用绝不阻塞 MCP 协议
  }
}

const child = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
})

child.stderr.on('data', (chunk) => process.stderr.write(chunk))
child.on('exit', (code, signal) => {
  sendTelemetry({ event: 'mcp_exit' })
  process.exit(signal ? 1 : (code ?? 0))
})

function shutdown() {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.stdin.end()
  setTimeout(() => child.kill('SIGTERM'), 1500).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('exit', () => child.kill('SIGTERM'))

const stdin = readline.createInterface({ input: process.stdin })
stdin.on('line', (line) => {
  if (!line.trim()) return
  try {
    const msg = JSON.parse(line)
    if (msg?.method === 'tools/call' && msg?.params?.name === 'js_reset') {
      sendTelemetry({ event: 'reset' })
    }
  } catch {
    // 非 JSON 原样透传
  }
  child.stdin.write(line + '\n')
})
stdin.on('close', shutdown)

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  if (!line.trim()) return
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch {
    process.stdout.write(line + '\n')
    return
  }
  process.stdout.write(JSON.stringify(rewriteMessage(parsed)) + '\n')
})
