/*
 * 超链接探针。
 *
 * 应用整个是一个 webview，<a> 按默认行为走会把界面替换成目标页面——
 * 用户看到的是应用突然「没了」，连后退按钮都没有。所以要盯住：
 *   1. 页面地址一动不动（没有被导航走）
 *   2. 外部地址交给系统浏览器（opener 插件的 open_url）
 *   3. 文件路径交给系统默认应用，相对路径按当前项目补成绝对路径
 */

async (page) => {
  await page.addInitScript(() => {
    const listeners = {}
    let seq = 1
    // 凡是「往外打开」的调用都记下来，供断言检查
    window.__OPENED__ = []

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
        if (cmd.startsWith('plugin:opener|') || cmd === 'open_path_with') {
          window.__OPENED__.push({ 方式: cmd, 参数: args })
          return null
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
                  data: { sessionId: 's1', messages: [] },
                }),
              5,
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
  const 起始地址 = page.url()

  // 造一条带链接的助手消息
  await page.evaluate(() => {
    const 正文 =
      '看 [示例站点](https://example.com/hello) 和 [src/app.ts](src/app.ts) 还有 [带行号](src/app.ts:42)'
    const ASSISTANT = {
      role: 'assistant',
      content: [],
      api: 'anthropic-messages',
      provider: 'p',
      model: 'm',
      timestamp: 1,
    }
    window.__PUSH__({ type: 'agent_start' })
    window.__PUSH__({ type: 'message_start', message: ASSISTANT })
    window.__PUSH__({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 正文 },
    })
    // 必须先落定再收尾：agent_settled 会把没落定的流式消息直接丢掉
    window.__PUSH__({
      type: 'message_end',
      message: { ...ASSISTANT, content: [{ type: 'text', text: 正文 }], stopReason: 'stop' },
    })
    window.__PUSH__({ type: 'agent_settled' })
  })
  await page.waitForTimeout(700)

  const 点 = async (文案) => {
    await page.getByRole('link', { name: 文案 }).first().click()
    await page.waitForTimeout(400)
    return page.evaluate(() => window.__OPENED__.at(-1) ?? null)
  }

  const 外部地址 = await 点('示例站点')
  const 相对文件 = await 点('src/app.ts')
  const 带行号 = await 点('带行号')

  return {
    起始地址,
    点完之后的地址: page.url(),
    地址没被导航走: page.url() === 起始地址,
    外部地址,
    相对文件,
    带行号,
  }
}
