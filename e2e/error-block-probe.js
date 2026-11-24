/*
 * 消息内错误提示的形态。
 *
 * 对齐 Codex 的 callout（type="error" + layout="verticalIcon"）：
 *   aside[role=alert] / 8px 圆角 / 12-16 内边距 / --color-text-danger 20% 描边
 *   / 极淡红底 / 左侧警示图标垂直居中 / 标题 14px 500 + 正文
 * 之前是一块中性灰底 + 一个 7px 红点，看着像引用块而不是报错。
 *
 * 这个探针推三种错误：带状态码的 429、非 JSON 的纯文本错误、用户中止。
 */
async (page) => {
  function installBridge() {
    const listeners = {}
    let seq = 1
    window.__PUSH__ = (frame) =>
      listeners['pi://message']?.({
        event: 'pi://message',
        payload: { slotId: 'default', payload: frame },
        id: 0,
      })

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
                data: { sessionName: '错误样式', messages: [] },
              })
            if (p.type !== 'prompt') return
            window.__PUSH__({ type: 'agent_start' })
            window.__PUSH__({
              type: 'message_start',
              message: { role: 'user', content: p.message, timestamp: 1 },
            })
            window.__PUSH__({
              type: 'message_end',
              message: { role: 'user', content: p.message, timestamp: 1 },
            })
          }, 10)
          return null
        }
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions')
          return [{ cwd: '/tmp/e2e', name: 'e2e-项目', latestMs: 1, sessions: [] }]
        if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
        if (cmd === 'read_models_config') return { providers: [] }
        if (cmd === 'read_app_settings') return {}
        return null
      },
    }
  }

  await page.addInitScript(installBridge)
  await page.setViewportSize({ width: 1200, height: 860 })
  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const project = page.getByText('e2e-项目', { exact: true }).first()
  if (await project.count()) {
    await project.click()
    await page.waitForTimeout(600)
  }

  await page.locator('textarea').first().fill('试一下')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)

  const MESSAGES = [
    {
      errorMessage:
        '429: {"type":"FreeUsageLimitError","message":"Rate limit exceeded. (request id: req_9f8a2c1d)"}',
      stopReason: 'error',
    },
    { errorMessage: 'Provider returned an empty response body.', stopReason: 'error' },
    { errorMessage: 'Request aborted', stopReason: 'aborted' },
  ]

  await page.evaluate((list) => {
    list.forEach((item, i) => {
      const msg = {
        role: 'assistant',
        content: [{ type: 'text', text: `第 ${i + 1} 次尝试。` }],
        api: 'anthropic-messages',
        provider: 'p',
        model: 'm',
        timestamp: 2 + i * 2,
        stopReason: item.stopReason,
        errorMessage: item.errorMessage,
      }
      window.__PUSH__({ type: 'message_start', message: { ...msg, content: [] } })
      window.__PUSH__({ type: 'message_end', message: msg })
    })
    window.__PUSH__({ type: 'agent_settled' })
  }, MESSAGES)
  await page.waitForTimeout(900)

  const read = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('main aside[role="alert"]')].map((el) => {
        const cs = getComputedStyle(el)
        const svg = el.querySelector('svg')
        const h3 = el.querySelector('h3')
        return {
          文案: el.innerText.trim().split('\n'),
          标签: el.tagName.toLowerCase(),
          圆角: cs.borderRadius,
          内边距: cs.padding,
          描边: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
          底色: cs.backgroundColor,
          文字色: cs.color,
          图标宽度: svg ? Math.round(svg.getBoundingClientRect().width) : null,
          图标色: svg ? getComputedStyle(svg).color : null,
          标题字号: h3 ? getComputedStyle(h3).fontSize : null,
          标题字重: h3 ? getComputedStyle(h3).fontWeight : null,
        }
      }),
    )

  const light = await read()
  await page.screenshot({ path: 'e2e/.shots/error-block-light.png' })

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.waitForTimeout(300)
  const dark = await read()
  await page.screenshot({ path: 'e2e/.shots/error-block-dark.png' })

  return JSON.stringify({ 浅色: light, 深色: dark }, null, 2)
}
