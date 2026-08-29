/*
 * 侧栏会话记录探针。
 *
 * 复现的是那个真实症状：新建对话、聊完，左侧目录下面一直没有这条会话。
 * 要盯住五件事：
 *   1. 发送那一刻就出现——pi 要等一轮跑完才写会话文件（实测），
 *      所以这一行只能是前端先补上的占位，扫描次数必须还没涨
 *   2. 一轮结束后会重扫会话目录
 *   3. 真的那条回来后按 path 撞上占位，列表里仍然只有一条
 *   4. 它是选中态——文件名是 pi 报回来的，不接管就永远标不上
 *   5. 点它不会白重启 pi；而「新对话」按钮必须真的重开一个
 */

async (page) => {
  const SESSION = '/S/2026-08-29T10-00-00Z_new.jsonl'

  await page.addInitScript((sessionPath) => {
    const listeners = {}
    let seq = 1
    // 探针要检查的调用计数与列表状态，挂到 window 上供断言读取
    window.__CALLS__ = { rpcStart: 0, scanSessions: 0 }
    window.__TURN_DONE__ = false

    window.__PUSH__ = (frame) =>
      listeners['pi://message']?.({ event: 'pi://message', payload: frame, id: 0 })

    const 空项目 = { cwd: '/tmp/e2e', name: 'e2e-项目', latestMs: 1, sessions: [] }
    // 一轮跑完 pi 才把会话文件落盘，所以扫描结果在这之前后是不一样的
    const 有会话 = {
      ...空项目,
      latestMs: 2,
      sessions: [
        {
          id: 's1',
          path: sessionPath,
          title: '想一下',
          timestamp: '2026-08-29T10:00:00Z',
          modifiedMs: 2,
        },
      ],
    }

    const respond = (p) => {
      if (p.type === 'get_state') {
        return {
          sessionId: 's1',
          sessionFile: sessionPath,
          model: null,
          thinkingLevel: 'off',
          isStreaming: false,
          isCompacting: false,
          steeringMode: '',
          followUpMode: '',
          autoCompactionEnabled: false,
          messageCount: 0,
          pendingMessageCount: 0,
        }
      }
      if (p.type === 'get_messages') return { messages: [] }
      return {}
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
        if (cmd === 'rpc_start') {
          window.__CALLS__.rpcStart += 1
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
                  data: respond(p),
                }),
              5,
            )
          }
          return null
        }
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions') {
          window.__CALLS__.scanSessions += 1
          return [window.__TURN_DONE__ ? 有会话 : 空项目]
        }
        if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
        if (cmd === 'read_models_config') return { providers: [] }
        if (cmd === 'read_app_settings') return {}
        if (cmd === 'read_git_diff' || cmd === 'read_git_diff_stat') return ''
        return null
      },
    }
  }, SESSION)

  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)

  // 侧栏会话行的状态：标题 + 是否选中
  const 侧栏 = () =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll('aside button')].filter((el) =>
        el.className.includes('sessionRow'),
      )
      return {
        会话行: rows.map((el) => `${el.innerText.trim()}${el.dataset.active === 'true' ? '（选中）' : ''}`),
        扫描次数: window.__CALLS__.scanSessions,
        启动次数: window.__CALLS__.rpcStart,
      }
    })

  const 开局 = await 侧栏()

  // 发一条消息。此时 pi 还没把会话文件写到盘上，扫描依然扫不到它
  const input = page.locator('textarea').first()
  await input.click()
  await input.fill('想一下')
  await page.keyboard.press('Enter')
  await page.evaluate(() => {
    window.__PUSH__({ type: 'agent_start' })
    window.__PUSH__({
      type: 'message_end',
      message: { role: 'user', content: '想一下', timestamp: 1 },
    })
  })
  await page.waitForTimeout(500)

  const 发送后立刻 = await 侧栏()

  // 一轮跑完，pi 这才落盘，之后的扫描才扫得到
  await page.evaluate(() => {
    window.__TURN_DONE__ = true
    window.__PUSH__({ type: 'agent_settled' })
  })
  await page.waitForTimeout(900)

  const 一轮之后 = await 侧栏()

  // 点当前这条：它就是眼下开着的，不该把 pi 杀掉重来
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('aside button')].find((el) =>
      el.className.includes('sessionRow'),
    )
    row?.click()
  })
  await page.waitForTimeout(700)
  const 点当前会话后 = await 侧栏()

  // 「新对话」必须真的重开一个，哪怕现在就在一个新会话里
  await page.getByTitle('新对话').first().click()
  await page.waitForTimeout(900)
  const 点新对话后 = await 侧栏()

  return { 开局, 发送后立刻, 一轮之后, 点当前会话后, 点新对话后 }
}
