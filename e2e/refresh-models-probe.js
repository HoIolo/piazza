/*
 * 设置里改完模型回到会话：不该重启 worker，也不该出现「未就绪」。
 *
 * 盯三件事：
 *   1. 调用 refresh_models 而不是重连（rpc_start 只应发生一次）
 *   2. 模型列表能拿到
 *   3. 输入框输入不触发文件搜索（面板没开）
 */
async (page) => {
  function bridge() {
    const listeners = {}
    let seq = 1
    const sent = []
    window.__SENT__ = sent
    window.__EVT__ = (frame) =>
      listeners['pi://message']?.({ event: 'pi://message', payload: { slotId: 'default', payload: frame }, id: 0 })
    let model = { id: 'a', name: 'Model A', provider: 'p', api: 'x' }
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
          sent.push(p.type)
          const reply = (data) =>
            setTimeout(() => window.__EVT__({ id: p.id, type: 'response', command: p.type, success: true, data }), 5)
          if (p.type === 'get_state') return reply({ model, sessionId: 's', messages: [] }) ?? null
          if (p.type === 'refresh_models') {
            model = { id: 'b', name: 'Model B', provider: 'p', api: 'x' }
            return reply({ models: [model] }) ?? null
          }
          if (p.type === 'get_available_models') return reply({ models: [model] }) ?? null
          if (p.type === 'get_available_thinking_levels') return reply({ levels: [] }) ?? null
          return reply({ sessionName: '会话', messages: [] }) ?? null
        }
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions') return [{ cwd: '/tmp/e2e', name: 'e2e-项目', latestMs: 1, sessions: [] }]
        if (cmd === 'search_project_files') {
          sent.push('search_project_files')
          return []
        }
        if (cmd === 'read_app_settings') return {}
        if (cmd.startsWith('list_')) return []
        if (cmd === 'read_models_config') return { providers: [] }
        return null
      },
    }
  }
  await page.addInitScript(bridge)
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1600)
  const project = page.getByText('e2e-项目', { exact: true }).first()
  if (await project.count()) { await project.click(); await page.waitForTimeout(700) }

  const before = await page.evaluate(() => window.__SENT__.slice())

  // 打字（面板没开）：不该触发文件搜索
  const input = page.locator('textarea').first()
  await input.click()
  await input.type('abcdefg', { delay: 30 })
  await page.waitForTimeout(400)
  const afterTyping = await page.evaluate(() => window.__SENT__.slice())

  // 模拟「设置里保存了模型」：直接调刷新入口
  await page.evaluate(async () => {
    const mod = await import('/src/store/chat/refreshRuntime.ts')
    await mod.refreshRuntimeAfterSave()
  })
  await page.waitForTimeout(600)
  const afterSave = await page.evaluate(() => window.__SENT__.slice())
  const modelText = await page.evaluate(
    () => document.querySelector('[aria-label="选择模型"]')?.innerText?.trim() ?? null,
  )

  return JSON.stringify(
    {
      启动阶段命令: before,
      打字后新增: afterTyping.slice(before.length),
      搜索次数: afterTyping.filter((c) => c === 'search_project_files').length,
      保存模型后新增: afterSave.slice(afterTyping.length),
      是否重启进程: afterSave.filter((c) => c === 'rpc_start').length,
      当前模型显示: modelText,
    },
    null,
    2,
  )
}
