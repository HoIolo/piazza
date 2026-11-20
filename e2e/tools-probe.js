/*
 * 工具分组、提问卡片与留白探针。
 *
 * 在浏览器里跑真实前端，只把 Tauri 桥接层换成桩。前提：vite dev 跑在 1420。
 * 跑法：Playwright run_code 指向本文件。
 *
 * 盯的是：
 *   工具分组 —— 连续多条工具调用收成一行汇总，点开才见明细；单条不套壳
 *   提问卡片 —— select 请求出现在输入框上方，选中后回 extension_ui_response
 *   发送留白 —— 第二轮发出后，新的用户消息滚到视口顶部附近，而不是贴着底
 */

/* run_code 要求整个文件是单个表达式，所以定义全部收在函数体内 */
async (page) => {
  function installBridge() {
    const listeners = {}
    let seq = 1
    let turn = 0
    window.__E2E__ = { sent: [] }
    const emit = (payload) => listeners['pi://message']?.({ event: 'pi://message', payload, id: 0 })

    const call = (id, name, args) => ({ type: 'toolCall', id, name, arguments: args })
    const CALLS = [
      call('t1', 'read', { path: '/tmp/e2e/src/app.ts' }),
      call('t2', 'read', { path: '/tmp/e2e/src/router.ts' }),
      call('t3', 'bash', { command: 'npm test -- --run' }),
      call('t4', 'edit', { path: '/tmp/e2e/src/app.ts', oldText: 'a', newText: 'b' }),
    ]
    const SINGLE = call('t5', 'bash', { command: 'git status --short' })
    const result = (text) => ({ content: [{ type: 'text', text }] })

    const assistant = (content, extra = {}) => ({
      role: 'assistant',
      content,
      api: 'anthropic-messages',
      provider: 'hub',
      model: 'm',
      stopReason: 'stop',
      timestamp: 1787212029225 + turn,
      ...extra,
    })

    /** 第一轮：思考 + 四条连续工具 + 正文 + 单条工具 + 结论 */
    function firstTurn(text) {
      const user = { role: 'user', content: text, timestamp: 1787212028225 }
      const work = assistant(
        [{ type: 'thinking', thinking: '先看入口和路由，再跑测试。' }, { type: 'text', text: '我先看一下入口。' }, ...CALLS],
        { stopReason: 'toolUse' },
      )
      const final = assistant([SINGLE, { type: 'text', text: '改好了，**测试全部通过**。' }])
      const exec = (c, out) => [
        { type: 'tool_execution_start', toolCallId: c.id, toolName: c.name, args: c.arguments },
        { type: 'tool_execution_end', toolCallId: c.id, toolName: c.name, result: result(out), isError: false },
      ]
      return [
        { type: 'agent_start' },
        { type: 'message_start', message: user },
        { type: 'message_end', message: user },
        { type: 'message_start', message: { ...work, content: [] } },
        { type: 'message_end', message: work },
        ...CALLS.flatMap((c) => exec(c, `${c.name} 的输出`)),
        { type: 'message_start', message: { ...final, content: [] } },
        { type: 'message_end', message: final },
        ...exec(SINGLE, ' M src/app.ts'),
        { type: 'agent_settled' },
      ]
    }

    /** 第二轮：停在运行中，并抛出一个 select 提问 */
    function secondTurn(text) {
      const user = { role: 'user', content: text, timestamp: 1787212038225 }
      return [
        { type: 'agent_start' },
        { type: 'message_start', message: user },
        { type: 'message_end', message: user },
        {
          type: 'extension_ui_request',
          id: 'ask-1',
          method: 'select',
          title: '要用哪种方式发布？',
          message: '两种都可以回滚。',
          options: ['灰度 10% 后全量', '直接全量', '先不发布'],
        },
      ]
    }

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
          window.__E2E__.sent.push(p)
          const data = { sessionName: '工具', sessionId: 'e2e', messages: [] }
          setTimeout(() => {
            if (p.id) emit({ id: p.id, type: 'response', command: p.type, success: true, data })
            if (p.type !== 'prompt') return
            turn += 1
            ;(turn === 1 ? firstTurn(p.message) : secondTurn(p.message)).forEach(emit)
          }, 10)
          return null
        }
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions')
          return [{ cwd: '/tmp/e2e', name: 'e2e-项目', latestMs: 1787212028225, sessions: [] }]
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
  const out = {}

  // ---- 第一轮：工具分组 ----
  await input.fill('把入口改一下并跑测试')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/.shots/tools-settled.png' })
  // 过程轮次落定后收在「耗时」那一行里，先把它展开
  await page.getByRole('button', { name: /耗时/ }).click()
  await page.waitForTimeout(400)
  const groupHead = page.locator('button[aria-expanded]', { hasText: /已读取|已运行|已编辑/ }).first()
  out.groupSummary = await groupHead.innerText()
  out.rowsBeforeExpand = await page.getByText('npm test -- --run').count()
  await page.screenshot({ path: 'e2e/.shots/tools-collapsed.png' })
  await groupHead.click()
  await page.waitForTimeout(400)
  out.rowsAfterExpand = await page.getByText('npm test -- --run').count()
  await page.screenshot({ path: 'e2e/.shots/tools-expanded.png' })

  // ---- 第二轮：留白 + 提问卡片 ----
  await input.fill('发布吧')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  out.secondUserTop = await page
    .getByText('发布吧', { exact: true })
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().top))
  const dialog = page.getByRole('dialog')
  out.dialogTitle = await dialog.locator('h4').innerText()
  await page.screenshot({ path: 'e2e/.shots/ask-card.png' })
  await dialog.getByRole('button', { name: /直接全量/ }).click()
  await page.waitForTimeout(300)
  out.answer = await page.evaluate(() =>
    window.__E2E__.sent.filter((p) => p.type === 'extension_ui_response'),
  )
  out.dialogGone = (await page.getByRole('dialog').count()) === 0

  return JSON.stringify(out, null, 2)
}
