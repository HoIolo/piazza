/*
 * 思考区探针：按真实事件形状推 thinking_delta，检查三个阶段的界面。
 *
 *   思考中   —— 标题「正在思考」+ 跟一行最新内容，且这一行会随 delta 变化
 *   转正文   —— 思考结束，最新一行收起（一旦开始吐正文，思考就不该还亮着）
 *   点击展开 —— 完整思维链可见
 */

async (page) => {
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
    window.__PUSH__ = (frame) => listeners['pi://message']?.({ event: 'pi://message', payload: frame, id: 0 })

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
            setTimeout(
              () =>
                window.__PUSH__({
                  id: p.id,
                  type: 'response',
                  command: p.type,
                  success: true,
                  data: { sessionName: '会话', messages: [] },
                }),
              10,
            )
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
  await page.waitForTimeout(1800)
  const project = page.getByText('e2e-项目', { exact: true }).first()
  if (await project.count()) {
    await project.click()
    await page.waitForTimeout(700)
  }
  const input = page.locator('textarea').first()
  await input.click()
  await input.fill('想一下')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)

  const push = (frames) => page.evaluate((fs) => fs.forEach((f) => window.__PUSH__(f)), frames)
  /*
   * 按结构定位思考块：contentWrap 是它独有的折叠容器。
   * 用 aria-expanded 选会撞上 Popover 触发器，用文案选会撞上 ExchangeGroup 的状态行。
   */
  const snapshot = () =>
    page.evaluate(() => {
      const wrap = [...document.querySelectorAll('main div')].find((el) =>
        el.className.includes('contentWrap'),
      )
      const block = wrap?.parentElement
      const row = block?.querySelector('button')
      const preview = [...(block?.children ?? [])].find((el) => el.className.includes('preview'))
      return {
        标题: row?.innerText.trim(),
        标题扫光: Boolean(row?.querySelector('[data-loading-anim="shimmer"]')),
        最新一行: preview?.textContent ?? '（无）',
        已展开: wrap?.dataset.expanded,
      }
    })

  await push([
    { type: 'agent_start' },
    { type: 'turn_start' },
    { type: 'message_start', message: { role: 'user', content: '想一下', timestamp: 1 } },
    { type: 'message_end', message: { role: 'user', content: '想一下', timestamp: 1 } },
    { type: 'message_start', message: ASSISTANT },
    think('先看清楚问题。\n'),
    think('第一步：确认输入的形状'),
  ])
  await page.waitForTimeout(300)
  const 思考中 = await snapshot()

  await push([think('\n第二步：这一行应当替换掉上一行')])
  await page.waitForTimeout(300)
  const 又来一行 = await snapshot()

  // 开始吐正文：思考应当收起
  await push([
    { type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 1, delta: '结论是这样。' } },
  ])
  await page.waitForTimeout(300)
  const 转正文 = await snapshot()

  await page.evaluate(() => {
    const wrap = [...document.querySelectorAll('main div')].find((el) =>
      el.className.includes('contentWrap'),
    )
    wrap?.parentElement?.querySelector('button')?.click()
  })
  await page.waitForTimeout(400)
  const 展开后 = await snapshot()

  return { 思考中, 又来一行, 转正文, 展开后 }
}
