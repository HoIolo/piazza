/*
 * Markdown 渲染探针：回放一轮带各类元素的回答，核对排版与代码块复制。
 * 前提：vite dev 跑在 1420。跑法：Playwright run_code 指向本文件。
 */
async (page) => {
  function installBridge() {
    const listeners = {}
    let seq = 1
    const text = [
      '# 一级标题', '第一段，含 `行内代码` 与 **加粗**。', '第二段。',
      '## 二级标题', '下面是列表：', '- 甲', '- 乙', '  - 乙之一', '',
      '> 一段引用', '', '---', '',
      '| 文件 | 行数 |', '| --- | --- |', '| a.ts | 12 |', '| b.ts | 340 |', '',
      '```ts', 'const answer = 42', 'console.log(answer)', '```', '',
      '```', '没标语言的围栏', '```',
    ].join('\n')
    const user = { role: 'user', content: '给我看看各种排版', timestamp: 1787212028225 }
    const assistant = {
      role: 'assistant',
      content: [{ type: 'text', text }],
      api: 'anthropic-messages',
      provider: 'hub',
      model: 'm',
      stopReason: 'stop',
      timestamp: 1787212029225,
    }
    const TURN = [
      { type: 'agent_start' },
      { type: 'message_start', message: user },
      { type: 'message_end', message: user },
      { type: 'message_start', message: { ...assistant, content: [] } },
      { type: 'message_end', message: assistant },
      { type: 'agent_settled' },
    ]
    const emit = (payload) => listeners['pi://message']?.({ event: 'pi://message', payload, id: 0 })
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
          const data = { sessionName: '排版', sessionId: 'e2e', messages: [] }
          setTimeout(() => {
            emit({ id: p.id, type: 'response', command: p.type, success: true, data })
            if (p.type === 'prompt') TURN.forEach(emit)
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

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(installBridge)
  await page.setViewportSize({ width: 1200, height: 1000 })
  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  const project = page.getByText('e2e-项目', { exact: true }).first()
  if (await project.count()) {
    await project.click()
    await page.waitForTimeout(900)
  }

  await page.locator('textarea').first().fill('给我看看各种排版')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)

  const px = (locator, prop) => locator.first().evaluate((el, p) => getComputedStyle(el)[p], prop)
  const main = page.locator('main')
  const out = {
    h1: await px(main.locator('h3'), 'fontSize'),
    h2: await px(main.locator('h4'), 'fontSize'),
    paragraphLineHeight: await px(main.locator('article p'), 'lineHeight'),
    inlineCodeRadius: await px(main.locator('p code'), 'borderRadius'),
    tableCellBorderLeft: await px(main.locator('td'), 'borderLeftWidth'),
    codeBlocks: await main.locator('pre').count(),
    plainFenceCodeBg: await px(main.locator('pre').nth(1).locator('code'), 'backgroundColor'),
  }
  await main.getByRole('button', { name: '复制代码' }).first().click()
  await page.waitForTimeout(150)
  out.copied = await page.evaluate(() => navigator.clipboard.readText())
  await page.screenshot({ path: 'e2e/.shots/markdown.png' })
  return JSON.stringify(out, null, 2)
}
