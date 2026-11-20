/*
 * 输入框与模型选择器探针。
 *
 * 在浏览器里跑真实前端，只把 Tauri 桥接层换成桩。前提：vite dev 跑在 1420。
 * 跑法：Playwright run_code 指向本文件。
 *
 * 盯的是这几件容易悄悄坏掉的事：
 *   主按钮三态   —— 空闲发送 / 运行中有字引导 / 运行中没字停止
 *   运行中追加   —— Enter 发 steer、⌘Enter 发 follow_up，且都不走 prompt
 *   排队列表     —— queue_update 之后输入框上方看得见那句话
 *   Esc 二次确认 —— 第一次只上膛，第二次才发 abort
 *   模型选择器   —— 滑杆改档发 set_thinking_level，模型列表选中发 set_model
 */

/* run_code 要求整个文件是单个表达式，所以定义全部收在函数体内 */
async (page) => {
  function installBridge() {
    const listeners = {}
    let seq = 1
    const model = (id, name) => ({ id, name, provider: 'hub', reasoning: true, input: ['text'] })
    const MODELS = [model('alpha-1', 'Alpha 1'), model('beta-2', 'Beta 2')]
    const state = { model: MODELS[0], thinkingLevel: 'medium', sessionId: 'e2e', sessionName: '测试会话' }
    const queue = { steering: [], followUp: [] }
    window.__E2E__ = { sent: [] }

    const emit = (payload) => listeners['pi://message']?.({ event: 'pi://message', payload, id: 0 })

    const dataFor = (p) => {
      if (p.type === 'set_thinking_level') state.thinkingLevel = p.level
      if (p.type === 'set_model') state.model = MODELS.find((m) => m.id === p.modelId)
      if (p.type === 'get_available_models') return { models: MODELS }
      if (p.type === 'get_available_thinking_levels')
        return { levels: ['off', 'low', 'medium', 'high', 'xhigh'] }
      if (p.type === 'get_messages') return { messages: [] }
      return { ...state }
    }

    const handleSend = (p) => {
      window.__E2E__.sent.push(p)
      setTimeout(() => {
        emit({ id: p.id, type: 'response', command: p.type, success: true, data: dataFor(p) })
        // prompt 之后停在运行中，由 abort 收尾，中间好观察按钮与排队
        if (p.type === 'prompt') emit({ type: 'agent_start' })
        if (p.type === 'steer') queue.steering.push(p.message)
        if (p.type === 'follow_up') queue.followUp.push(p.message)
        if (p.type === 'steer' || p.type === 'follow_up') emit({ type: 'queue_update', ...queue })
        if (p.type === 'abort') emit({ type: 'agent_settled' })
      }, 10)
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
        if (cmd === 'rpc_send') return handleSend(args.payload) ?? null
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
  const primary = page.locator('button[data-action]')
  const action = () => primary.getAttribute('data-action')
  const types = () => page.evaluate(() => window.__E2E__.sent.map((p) => p.type))
  const count = async (type) => (await types()).filter((t) => t === type).length
  const out = {}

  // ---- 外观 ----
  out.box = await input.evaluate((el) => {
    const box = getComputedStyle(el.parentElement)
    return { radius: box.borderRadius, border: box.borderTopWidth, inputMinHeight: getComputedStyle(el).minHeight }
  })
  out.idleAction = await action()
  out.idleDisabled = await primary.isDisabled()

  // ---- 模型选择器 ----
  await page.getByTitle('选择模型').click()
  await page.waitForTimeout(300)
  const range = page.locator('input[type=range]')
  out.sliderValueText = await range.getAttribute('aria-valuetext')
  await range.focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(200)
  out.sliderAfterRight = await range.getAttribute('aria-valuetext')
  await page.screenshot({ path: 'e2e/.shots/model-picker.png' })
  await page.getByRole('button', { name: '选择模型', exact: true }).last().click()
  await page.getByRole('menuitemradio', { name: /Beta 2/ }).click()
  await page.waitForTimeout(300)
  out.backToSlider = (await range.count()) === 1
  out.triggerText = await page.getByTitle('选择模型').innerText()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  out.popoverClosedByEsc = (await range.count()) === 0

  // ---- 发送，进入运行中 ----
  await input.fill('第一句')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  out.runningEmptyAction = await action()

  await input.fill('补充一句')
  out.runningTypedAction = await action()
  await page.keyboard.press('Enter')
  await input.fill('等会儿再做')
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(300)
  out.queuedText = await page.getByLabel('待送达的消息').innerText()
  await page.screenshot({ path: 'e2e/.shots/composer-running.png' })

  // ---- Esc 二次确认 ----
  await input.focus()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  await page.screenshot({ path: 'e2e/.shots/composer-esc.png' })
  out.afterFirstEsc = { abort: await count('abort'), button: await primary.innerText() }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  out.afterSecondEsc = { abort: await count('abort'), action: await action() }

  out.counts = {
    prompt: await count('prompt'),
    steer: await count('steer'),
    follow_up: await count('follow_up'),
    set_thinking_level: await count('set_thinking_level'),
    set_model: await count('set_model'),
  }
  return JSON.stringify(out, null, 2)
}
