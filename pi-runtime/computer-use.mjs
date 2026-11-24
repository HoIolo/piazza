import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'

function resolveNativeBinary(runtimeDir) {
  if (process.platform === 'darwin') {
    return join(runtimeDir, 'Open Computer Use.app', 'Contents', 'MacOS', 'OpenComputerUse')
  }
  if (process.platform === 'win32') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    return join(runtimeDir, 'windows', arch, 'open-computer-use.exe')
  }
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return join(runtimeDir, 'linux', arch, 'open-computer-use')
}

function sendTurnEnded(port, token) {
  if (!port) return
  try {
    const conn = net.createConnection({ host: '127.0.0.1', port })
    conn.on('error', () => undefined)
    conn.on('connect', () => {
      conn.end(JSON.stringify({ token, event: 'turn_end', ts: Date.now() }) + '\n')
    })
    conn.unref()
  } catch {
    // 忽略遥测断开
  }
}

/**
 * 内置 Open Computer Use 扩展：
 * - 通过 pi.registerMcpServer() 直接注册 `computer-use` MCP（不污染用户的 mcp.json）
 * - 自动注入内置 Node + proxy.mjs + open-computer-use-repl.mjs + telemetry-tap.mjs + 原生二进制
 * - 默认开启 OPEN_COMPUTER_USE_VISUAL_CURSOR 虚拟软件鼠标
 * - 每轮 agent_end 后通知原生二进制与 Piazza 宿主机收尾（柔和收起虚拟鼠标与活跃脉冲）
 */
export function createComputerUseExtension() {
  return (pi) => {
    const enabled = process.env.PIAZZA_OCU_ENABLED !== '0'
    const runtimeDir = process.env.PIAZZA_OCU_RUNTIME_DIR || ''
    if (!enabled || !runtimeDir) return

    const proxyPath = join(runtimeDir, 'proxy.mjs')
    const tapPath = join(runtimeDir, 'telemetry-tap.mjs')
    const adapterPath = join(runtimeDir, 'open-computer-use-repl.mjs')
    const nativePath = resolveNativeBinary(runtimeDir)
    if (![proxyPath, tapPath, adapterPath, nativePath].every(existsSync)) return

    const visualCursor = process.env.PIAZZA_OCU_VISUAL_CURSOR === '0' ? '0' : '1'
    const eventPort = Number(process.env.PIAZZA_OCU_EVENT_PORT || 0)
    const eventToken = process.env.PIAZZA_OCU_EVENT_TOKEN || ''
    const nodeBin = process.execPath

    pi.registerMcpServer('computer-use', {
      command: nodeBin,
      args: [
        proxyPath,
        nodeBin,
        adapterPath,
        '--',
        nodeBin,
        tapPath,
        nativePath,
        'mcp',
      ],
      env: {
        OPEN_COMPUTER_USE_VISUAL_CURSOR: visualCursor,
        ...(eventPort ? { PIAZZA_OCU_EVENT_PORT: String(eventPort) } : {}),
        ...(eventToken ? { PIAZZA_OCU_EVENT_TOKEN: eventToken } : {}),
      },
      exposure: 'direct',
      timeout: 120,
      description:
        '内置桌面控制（Open Computer Use）：在后台直接操控 macOS/桌面应用，支持虚拟鼠标展示与实时操作预览。工具：js（持久 JS REPL，cua 在作用域内）、js_reset。',
    })

    pi.on('agent_end', () => {
      sendTurnEnded(eventPort, eventToken)
      if (process.platform === 'darwin') {
        execFile(nativePath, ['turn-ended'], { timeout: 3000 }, () => undefined)
      }
    })
  }
}
