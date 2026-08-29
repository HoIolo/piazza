/*
 * 自动滚动探针。
 *
 * 关键场景是「同一个文本块里一个字一个字地长」——流式输出的常态。
 * 消息条数不变、内容块数也不变，只有块里的字在变多。
 * 若自动滚动是靠「条数/块数变了」来触发的，这种情况下一次都不会触发。
 */

async (page) => {
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

  await page.setViewportSize({ width: 1200, height: 700 })
  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)

  // 滚动容器的位置：离底多远才是关键
  const 量 = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll('main div')].find(
        (d) => d.className.includes('scroller') && d.scrollHeight > d.clientHeight + 4,
      )
      if (!el) return { 找到滚动容器: false }
      return {
        找到滚动容器: true,
        内容高: Math.round(el.scrollHeight),
        离底: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight),
      }
    })

  await page.evaluate(() => {
    const ASSISTANT = {
      role: 'assistant',
      content: [],
      api: 'anthropic-messages',
      provider: 'p',
      model: 'm',
      timestamp: 1,
    }
    window.__PUSH__({ type: 'agent_start' })
    window.__PUSH__({ type: 'message_start', message: { role: 'user', content: '写长一点', timestamp: 1 } })
    window.__PUSH__({ type: 'message_end', message: { role: 'user', content: '写长一点', timestamp: 1 } })
    window.__PUSH__({ type: 'message_start', message: ASSISTANT })
  })
  await page.waitForTimeout(400)

  // 往同一个块里持续追加，模拟真实的 text_delta
  const 追加 = async (轮次) => {
    for (let i = 0; i < 轮次; i += 1) {
      await page.evaluate((n) => {
        window.__PUSH__({
          type: 'message_update',
          assistantMessageEvent: {
            type: 'text_delta',
            contentIndex: 0,
            delta: `第 ${n} 段：这一段用来把内容撑高，让滚动容器真的需要滚动才看得到后面的东西。\n\n`,
          },
        })
      }, i)
      await page.waitForTimeout(60)
    }
    await page.waitForTimeout(500)
  }

  await 追加(12)
  const 流式中 = await 量()

  await 追加(12)
  const 继续流式 = await 量()

  // 块数变化时（新开一个块）应该是能滚的，用来对照
  await page.evaluate(() => {
    window.__PUSH__({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', contentIndex: 1, delta: '换了个新块。' },
    })
  })
  await page.waitForTimeout(600)
  const 新开一个块 = await 量()

  /*
   * 这个 hook 存在的理由：用户往上翻历史时，新内容不该把他拽回底部。
   * 盯高度的做法很容易把这条弄丢，所以必须一并验。
   */
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('main div')].find(
      (d) => d.className.includes('scroller') && d.scrollHeight > d.clientHeight + 4,
    )
    if (el) el.scrollTop = 0
  })
  await page.waitForTimeout(300)
  const 手动翻到顶 = await 量()

  await 追加(6)
  const 翻到顶后又来内容 = await 量()

  return { 流式中, 继续流式, 新开一个块, 手动翻到顶, 翻到顶后又来内容 }
}
