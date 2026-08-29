/*
 * 轮次状态行探针。
 *
 * 期望的顺序（与 Codex 一致）：
 *   发送后            正在思考（不带秒数、不画下边框、也不该同时冒出思考块）
 *   模型开口后        处理中 Ns —— 而且 N 是从发送算起的，不在转换时归零
 *   跑完              耗时 Ns
 */

async (page) => {
  await page.clock.install()

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
              data: { sessionId: 's1', messages: [] },
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
  await page.waitForTimeout(700)

  /* statusRow 是轮次状态行；contentWrap 只有思考块有，用它判断思考块在不在 */
  const 看 = () =>
    page.evaluate(() => {
      const row = [...document.querySelectorAll('main div')].find((el) =>
        el.className.includes('statusRow'),
      )
      const 思考块 = [...document.querySelectorAll('main div')].find((el) =>
        el.className.includes('contentWrap'),
      )
      return {
        状态行: row?.innerText.trim() ?? '（没有状态行）',
        下边框:
          row && getComputedStyle(row).borderBottomStyle !== 'none'
            ? getComputedStyle(row).borderBottomWidth
            : '无',
        思考块: 思考块 ? (思考块.parentElement?.querySelector('button')?.innerText.trim() ?? '?') : '无',
      }
    })

  const 走 = async (ms) => {
    await page.clock.runFor(ms)
    await page.waitForTimeout(250)
  }

  const input = page.locator('textarea').first()
  await input.click()
  await input.fill('想一下')
  await page.keyboard.press('Enter')

  const ASSISTANT = {
    role: 'assistant',
    content: [],
    api: 'anthropic-messages',
    provider: 'p',
    model: 'm',
    timestamp: 1,
  }
  await page.evaluate((a) => {
    window.__PUSH__({ type: 'agent_start' })
    window.__PUSH__({ type: 'message_end', message: { role: 'user', content: '想一下', timestamp: 1 } })
    window.__PUSH__({ type: 'message_start', message: a })
  }, ASSISTANT)

  await 走(5000)
  const 等模型开口 = await 看()

  // 模型吐出第一段思考 = 它开口了
  await page.evaluate(() => {
    window.__PUSH__({
      type: 'message_update',
      assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: '先看清楚问题。' },
    })
  })
  await 走(3000)
  const 模型开口后 = await 看()

  await page.evaluate((a) => {
    window.__PUSH__({
      type: 'message_end',
      message: { ...a, content: [{ type: 'thinking', thinking: '先看清楚问题。' }], stopReason: 'stop' },
    })
    window.__PUSH__({ type: 'agent_settled' })
  }, ASSISTANT)
  await 走(1000)
  const 跑完 = await 看()

  return { 等模型开口, 模型开口后, 跑完 }
}
