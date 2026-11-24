// 内层原生 MCP 遥测分流器：
// 夹在 open-computer-use-repl.mjs 与原生 OpenComputerUse mcp 之间，
// 逐行零改写透传 JSON-RPC，同时把每一次原子操作（app、工具名、window_id、截图）
// 通过本机回环 TCP 实时上报给 Piazza Rust 侧，驱动被控窗口角标与右上角实时预览。

import { spawn } from 'node:child_process'
import net from 'node:net'
import readline from 'node:readline'

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('ocu-telemetry-tap: 缺少原生可执行文件')
  process.exit(1)
}

const ACTION_LABELS = {
  open_app: '正在打开应用',
  get_app_state: '正在观察界面',
  query: '正在定位控件',
  click: '正在点击',
  double_click: '正在双击',
  right_click: '正在右键点击',
  drag: '正在拖拽',
  type_text: '正在输入文本',
  set_value: '正在填写内容',
  select_text: '正在选中文本',
  press_key: '正在按键',
  scroll: '正在滚动',
  perform_secondary_action: '正在执行操作',
  list_apps: '正在扫描应用',
}

const telemetryPort = Number(process.env.PIAZZA_OCU_EVENT_PORT || 0)
const telemetryToken = process.env.PIAZZA_OCU_EVENT_TOKEN || ''
const pending = new Map()
let socket = null
let connecting = false
const queue = []

function flushQueue() {
  if (!socket || socket.destroyed || !socket.writable) return
  while (queue.length > 0) {
    socket.write(queue.shift())
  }
}

function connectTelemetry() {
  if (!telemetryPort || connecting || (socket && !socket.destroyed)) return
  connecting = true
  const conn = net.createConnection({ host: '127.0.0.1', port: telemetryPort })
  conn.on('connect', () => {
    connecting = false
    socket = conn
    flushQueue()
  })
  conn.on('error', () => {
    connecting = false
    if (socket === conn) socket = null
  })
  conn.on('close', () => {
    connecting = false
    if (socket === conn) socket = null
  })
  conn.unref()
}

function emit(payload) {
  if (!telemetryPort) return
  const line = JSON.stringify({ token: telemetryToken, ...payload }) + '\n'
  if (socket && !socket.destroyed && socket.writable) {
    socket.write(line)
    return
  }
  if (queue.length < 64) queue.push(line)
  connectTelemetry()
}

function extractWindowId(text, argsObj) {
  if (Number.isInteger(argsObj?.window_id) && argsObj.window_id > 0) return argsObj.window_id
  if (typeof text !== 'string' || !text) return null
  const patterns = [
    /"window_id"\s*:\s*(\d+)/,
    /"windowId"\s*:\s*(\d+)/,
    /\bwindow_id[=:]\s*(\d+)/i,
    /\bwindowId[=:]\s*(\d+)/i,
    /\bwindow\s+id[=:]\s*(\d+)/i,
  ]
  for (const re of patterns) {
    const match = text.match(re)
    if (match) {
      const id = Number(match[1])
      if (Number.isSafeInteger(id) && id > 0) return id
    }
  }
  return null
}

function inspectRequest(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg?.method === 'notifications/turn-ended') {
    emit({ event: 'turn_end' })
    return
  }
  if (msg?.method !== 'tools/call') return
  const tool = msg?.params?.name
  const toolArgs = msg?.params?.arguments ?? {}
  const appName = typeof toolArgs.app === 'string' && toolArgs.app.trim() ? toolArgs.app.trim() : null
  const label = ACTION_LABELS[tool] ?? `正在执行 ${tool ?? '操作'}`
  if (msg.id !== undefined) {
    pending.set(String(msg.id), { tool, appName, args: toolArgs, label })
  }
  if (appName) {
    emit({
      event: 'action_start',
      tool,
      appName,
      windowId: extractWindowId('', toolArgs),
      label,
      ts: Date.now(),
    })
  }
}

function inspectResponse(line) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  if (msg?.id === undefined) return
  const entry = pending.get(String(msg.id))
  if (!entry) return
  pending.delete(String(msg.id))
  if (!entry.appName) return

  const content = Array.isArray(msg?.result?.content) ? msg.result.content : []
  const textParts = content
    .filter((c) => c?.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
  const fullText = textParts.join('\n')
  const imagePart = content.find((c) => c?.type === 'image' && typeof c.data === 'string')
  const windowId = extractWindowId(fullText, entry.args)
  const isError = Boolean(msg?.result?.isError || msg?.error)

  emit({
    event: 'action_end',
    tool: entry.tool,
    appName: entry.appName,
    windowId,
    label: isError ? `${entry.label}失败` : entry.label,
    ok: !isError,
    screenshot: imagePart
      ? { mimeType: imagePart.mimeType || 'image/png', data: imagePart.data }
      : null,
    ts: Date.now(),
  })
}

const child = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
})

child.stderr.on('data', (chunk) => process.stderr.write(chunk))
child.on('exit', (code, signal) => {
  emit({ event: 'native_exit' })
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
  inspectRequest(line)
  child.stdin.write(line + '\n')
})
stdin.on('close', shutdown)

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  if (!line.trim()) return
  inspectResponse(line)
  process.stdout.write(line + '\n')
})
