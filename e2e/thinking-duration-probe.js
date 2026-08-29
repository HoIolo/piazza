/*
 * 思考计时探针：核对「正在思考 Ns」→「已思考 Ns」的秒数与单位。
 *
 * 用假时钟，不真等一分钟。要盯住四件事：
 *   1. 思考中秒数会跟着涨
 *   2. 跨过 60 秒后单位自己升级成「分钟」
 *   3. 一开始吐正文就停表，之后时间再走数字也不能变
 *   4. message_end 落定、agent_settled 收尾后，数字仍在
 *      —— 这一步最容易退化：落定用的是 pi 回传的消息，不接管计时就会掉回光秃秃的「已思考」
 */

async (page) => {
  await page.clock.install()

  const ASSISTANT = {
    role: 'assistant',
    content: [],
    api: 'anthropic-messages',
    provider: 'p',
    model: 'm',
    timestamp: 1787212028260,
  }
  const think = (delta) => ({
    type: 'message_update',
    assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta },
  })

  await page.addInitScript(() => {
    const listeners = {}
    let seq = 1
    window.__PUSH__ = (frame) =>
      listeners['pi://message']?.({ event: 'pi://message', payload: frame, id: 0 })

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
          if (p.type !== 'prompt') {
            window.__PUSH__({
              id: p.id,
              type: 'response',
              command: p.type,
              success: true,
              data: { sessionName: '会话', messages: [] },
            })
          }
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
  })

  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.clock.runFor(1500)
  await page.waitForTimeout(600)

  const project = page.getByText('e2e-项目', { exact: true }).first()
  if (await project.count()) {
    await project.click()
    await page.clock.runFor(500)
    await page.waitForTimeout(500)
  }

  const input = page.locator('textarea').first()
  await input.click()
  await input.fill('想一下')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)

  const push = (frames) => page.evaluate((fs) => fs.forEach((f) => window.__PUSH__(f)), frames)

  /* 按结构定位思考块：contentWrap 是它独有的折叠容器，文案选会撞上 ExchangeGroup 的状态行 */
  const 标题 = () =>
    page.evaluate(() => {
      const wrap = [...document.querySelectorAll('main div')].find((el) =>
        el.className.includes('contentWrap'),
      )
      return wrap?.parentElement?.querySelector('button')?.innerText.trim() ?? '（找不到思考块）'
    })

  // 走时：advance 假时钟，再留出真实时间让 React 刷新
  const 走 = async (ms) => {
    await page.clock.runFor(ms)
    await page.waitForTimeout(250)
  }

  await push([
    { type: 'agent_start' },
    { type: 'turn_start' },
    { type: 'message_start', message: { role: 'user', content: '想一下', timestamp: 1 } },
    { type: 'message_end', message: { role: 'user', content: '想一下', timestamp: 1 } },
    { type: 'message_start', message: ASSISTANT },
    // 思考计时从首个 thinking 事件起表，不含等 API 开口那段（那段归状态行报）
    think('先看清楚问题。'),
  ])
  await 走(3000)
  const 刚开始 = await 标题()

  await push([think('再想想。')])
  await 走(9000)
  const 思考中 = await 标题()

  /*
   * 大跨度用 fastForward：runFor 会把区间内每一次定时器都补跑一遍，
   * 而这里挂着一个 1 秒的心跳，跳两天就是 17 万次回调，探针会直接卡死。
   * fastForward 对每个到期定时器只补跑一次，正是这里要的。
   */
  const 快进 = async (ms) => {
    await page.clock.fastForward(ms)
    await page.waitForTimeout(250)
  }

  // 跨过一分钟，单位应当自己升级
  await push([think('\n继续想。')])
  await 走(53_000)
  const 过一分钟 = await 标题()

  // 继续往上跨两级：小时、天
  await 快进(2 * 3600_000)
  const 过两小时 = await 标题()
  await 快进(2 * 86_400_000)
  const 过两天 = await 标题()

  // 开始吐正文 → 停表
  await push([
    {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 1, delta: '结论是这样。' },
    },
  ])
  await 走(1000)
  const 转正文 = await 标题()

  // 停表之后时间再走，数字不能再变
  await 走(30_000)
  const 停表后又过半分钟 = await 标题()

  // 落定：这一步若不接管计时，数字就会掉回光秃秃的「已思考」
  const 成品 = {
    ...ASSISTANT,
    content: [
      { type: 'thinking', thinking: '先看清楚问题。\n继续想。' },
      { type: 'text', text: '结论是这样。' },
    ],
    stopReason: 'stop',
  }
  await push([{ type: 'message_end', message: 成品 }, { type: 'agent_settled' }])
  await 走(1000)
  const 落定后 = await 标题()

  return { 刚开始, 思考中, 过一分钟, 过两小时, 过两天, 转正文, 停表后又过半分钟, 落定后 }
}
