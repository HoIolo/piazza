/*
 * 环境信息停靠探针。
 *
 * 环境信息在主区够宽时停靠成会话区右侧的卡片，顶栏按钮是它的开关；
 * 主区太窄时退回顶栏弹窗。要盯住：
 *   1. 宽窗口：卡片在、顶栏按钮呈按下态；点一下卡片收起，再点回来
 *   2. 窄窗口：卡片没了，同一位置是弹窗入口；打开后分支/工作模式的
 *      二级菜单必须完整可见，不能被弹窗自己的滚动框切掉
 *
 * 前提：vite dev 跑在 1420。跑法：Playwright run_code 指向本文件。
 */

async (page) => {
  await page.addInitScript(() => {
    const listeners = {}
    let seq = 1
    const emit = (event, payload) => listeners[event]?.({ event, payload, id: 0 })

    window.__TAURI_INTERNALS__ = {
      transformCallback(fn) {
        const id = seq++
        window[`_${id}`] = fn
        return id
      },
      async invoke(cmd, args) {
        if (cmd === 'plugin:event|listen') {
          listeners[args.event] = window[`_${args.handler}`]
          return seq++
        }
        if (cmd === 'rpc_send') {
          const p = args.payload
          const data =
            p.type === 'get_state'
              ? { sessionId: 's1', sessionName: '探针会话', thinkingLevel: 'off', isStreaming: false }
              : { models: [], levels: ['off'], messages: [] }
          setTimeout(
            () => emit('pi://message', { id: p.id, type: 'response', command: p.type, success: true, data }),
            5,
          )
          return null
        }
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions')
          return [{ cwd: '/tmp/e2e', name: 'e2e-项目', latestMs: 1, sessions: [] }]
        if (cmd === 'read_git_branch') return 'main'
        if (cmd === 'list_git_branches') return ['main', 'feat/dock']
        if (cmd === 'read_git_diff_stat') return [924, 201]
        if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
        if (cmd === 'read_models_config') return { providers: {} }
        if (cmd === 'read_app_settings') return {}
        return null
      },
    }
    window.__PUSH__ = (frame) => emit('pi://message', frame)
  })

  await page.setViewportSize({ width: 1200, height: 820 })
  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  // 造一条助手消息，离开空状态——空状态下环境信息不出现
  await page.evaluate(() => {
    const ASSISTANT = { role: 'assistant', content: [], api: 'anthropic-messages', provider: 'p', model: 'm', timestamp: 1 }
    window.__PUSH__({ type: 'agent_start' })
    window.__PUSH__({ type: 'message_start', message: ASSISTANT })
    window.__PUSH__({ type: 'message_end', message: { ...ASSISTANT, content: [{ type: 'text', text: '你好' }], stopReason: 'stop' } })
    window.__PUSH__({ type: 'agent_settled' })
  })
  await page.waitForTimeout(600)

  const dock = page.locator('aside[aria-label="环境信息"]')
  const button = page.getByRole('button', { name: '环境信息' })
  const box = async (loc) => ((await loc.count()) ? loc.first().boundingBox() : null)

  const 宽_初始 = { 卡片: await box(dock), 按钮按下: await button.getAttribute('aria-pressed') }
  await button.click()
  await page.waitForTimeout(300)
  const 宽_点一下 = { 卡片数: await dock.count(), 按钮按下: await button.getAttribute('aria-pressed') }
  await button.click()
  await page.waitForTimeout(300)
  const 宽_再点 = { 卡片数: await dock.count() }
  await page.screenshot({ path: '.playwright-mcp/env-dock-wide.png' })

  await page.setViewportSize({ width: 1000, height: 820 })
  await page.waitForTimeout(400)
  const 窄_初始 = { 卡片数: await dock.count(), 弹窗入口: await button.getAttribute('aria-haspopup') }
  await button.click()
  await page.waitForTimeout(300)
  const 弹窗 = page.locator('[role="menu"]').first()
  const 弹窗框 = await box(弹窗)
  // 打开二级菜单：工作模式
  await 弹窗.getByRole('button', { name: /本地/ }).click()
  await page.waitForTimeout(300)
  const 子菜单 = page.locator('[role="menu"] [role="menu"]').first()
  const 子菜单框 = await box(子菜单)
  const 子菜单标题可见 = await 子菜单.getByText('工作模式').isVisible().catch(() => false)
  await page.screenshot({ path: '.playwright-mcp/env-dock-narrow.png' })

  return {
    宽_初始,
    宽_点一下,
    宽_再点,
    窄_初始,
    弹窗框,
    子菜单框,
    子菜单标题可见,
    // 子菜单必须落在视口内且不被父弹窗裁掉：底边不超过视口
    子菜单未出屏: 子菜单框 ? 子菜单框.y + 子菜单框.height <= 820 : null,
  }
}
