/*
 * 「正在思考」那一行不该带图标。
 *
 * Codex 的 activity header 只有拿到 iconItem 才画图标槽位；between-tools 阶段
 * 拿不到，槽位宽度直接收成 0。我们之前无论什么状态都挂工具图标，
 * 于是「正在思考」旁边顶着一个终端图标——它指代不了任何东西。
 *
 * 这个探针按真实事件形状推流：先跑一条工具（此时**应当**有图标），
 * 再进入工具之间的思考（此时**不该**有图标）。
 */

async (page) => {
  function installBridge() {
    const listeners = {}
    let seq = 1
    // 事件载荷是 SlotEvent：{ slotId, payload: frame }
    window.__PUSH__ = (frame) =>
      listeners['pi://message']?.({
        event: 'pi://message',
        payload: { slotId: 'default', payload: frame },
        id: 0,
      })

    const CALL = { type: 'toolCall', id: 't1', name: 'read', arguments: { path: '/tmp/e2e/a.ts' } }
    const work = {
      role: 'assistant',
      content: [{ type: 'thinking', thinking: '先看文件。' }, CALL],
      api: 'anthropic-messages',
      provider: 'p',
      model: 'm',
      stopReason: 'toolUse',
      timestamp: 1787212029225,
    }
    window.__FIXTURE__ = { CALL, work }

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
          setTimeout(() => {
            if (p.id)
              window.__PUSH__({
                id: p.id,
                type: 'response',
                command: p.type,
                success: true,
                data: { sessionName: '图标', messages: [] },
              })
            if (p.type !== 'prompt') return
            const user = { role: 'user', content: p.message, timestamp: 1787212028225 }
            const { work: w } = window.__FIXTURE__
            const frames = [
              { type: 'agent_start' },
              { type: 'message_start', message: user },
              { type: 'message_end', message: user },
              { type: 'message_start', message: { ...w, content: [] } },
              { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: '先看文件。' } },
              { type: 'message_update', assistantMessageEvent: { type: 'toolcall_delta', contentIndex: 1, delta: '' } },
              { type: 'message_end', message: w },
              { type: 'tool_execution_start', toolCallId: 't1', toolName: 'read', args: { path: '/tmp/e2e/a.ts' } },
            ]
            frames.forEach(window.__PUSH__)
          }, 10)
          return null
        }
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions')
          return [{ cwd: '/tmp/e2e', name: 'e2e-项目', latestMs: 1, sessions: [] }]
        if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
        if (cmd === 'read_models_config') return { providers: [] }
        if (cmd === 'read_app_settings') return {}
        if (cmd === 'read_git_diff' || cmd === 'read_git_diff_stat') return ''
        return null
      },
    }
  }

  await page.addInitScript(installBridge)
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const project = page.getByText('e2e-项目', { exact: true }).first()
  if (await project.count()) {
    await project.click()
    await page.waitForTimeout(700)
  }

  const input = page.locator('textarea').first()
  await input.fill('读一下这个文件')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)

  // 工具在跑：这一行应当有图标
  const during = await page.evaluate(() => {
    // 行尾的展开箭头也是 svg，只数宽度 16 的那个才算「工具图标」
    const svgInfo = (el) => {
      const svgs = [...el.querySelectorAll('svg')].map((s) => Math.round(s.getBoundingClientRect().width))
      return { svg宽度: svgs, 工具图标: svgs.includes(16) }
    }
    const head = [...document.querySelectorAll('main button[aria-expanded]')].find((b) =>
      /读取|正在思考|已读取/.test(b.innerText),
    )
    return head ? { 文案: head.innerText.trim(), ...svgInfo(head) } : null
  })
  await page.screenshot({ path: 'e2e/.shots/thinking-icon-tool.png' })

  // 工具结束，进入「工具之间的思考」：不该再有图标
  await page.evaluate(() => {
    window.__PUSH__({ type: 'tool_execution_end', toolCallId: 't1', toolName: 'read', result: { content: [{ type: 'text', text: 'ok' }] }, isError: false })
    window.__PUSH__({ type: 'message_start', message: { role: 'assistant', content: [], api: 'anthropic-messages', provider: 'p', model: 'm', timestamp: 1787212039225 } })
    window.__PUSH__({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: '再看看调用方。' } })
  })
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => {
    const svgInfo = (el) => {
      const svgs = [...el.querySelectorAll('svg')].map((s) => Math.round(s.getBoundingClientRect().width))
      return { 工具图标: svgs.includes(16) }
    }
    const heads = [...document.querySelectorAll('main button[aria-expanded]')]
      .filter((b) => /读取|思考/.test(b.innerText))
      .map((b) => ({ 文案: b.innerText.trim().slice(0, 20), ...svgInfo(b) }))
    const thinking = [...document.querySelectorAll('main span')].find(
      (s) => s.textContent?.trim() === '正在思考',
    )
    const row = thinking?.closest('button')
    return {
      全部行: heads,
      思考行: row ? { 文案: row.innerText.trim(), ...svgInfo(row) } : null,
    }
  })
  await page.screenshot({ path: 'e2e/.shots/thinking-icon-thinking.png' })

  return JSON.stringify({ 工具运行中: during, 工具之间思考: after }, null, 2)
}
