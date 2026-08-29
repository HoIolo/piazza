/*
 * 聊天全链路 e2e。
 *
 * 在浏览器里跑真实前端，只把 Tauri 桥接层换成桩；回放的帧形状来自真实
 * `pi --mode rpc` 抓包（见 frames.jsonl）与真实会话文件，不是手编的。
 *
 * 前提：vite dev 跑在 1420。跑法：Playwright run_code 指向本文件。
 *
 * 三个场景同跑，因为它们的失败方式各不相同、而且都真的出过事：
 *   正常一轮   —— 用户消息必须只渲染一次（曾因 message_start/end 双写而重复）
 *   送不到 pi  —— 用户消息必须留在界面上（曾因无本地回显而凭空消失）
 *   上游报错   —— 错误必须被翻译成人话（曾原样甩出整串 JSON）
 */

/* run_code 要求整个文件是单个表达式，所以定义全部收在函数体内 */
async (page) => {
  const USER_TEXT = 'reply with the single word: pong'

  /** 真实抓包得到的一轮事件序列，errorMessage 由各场景覆盖 */
  function framesFor(errorMessage) {
    const user = {
      role: 'user',
      content: [{ type: 'text', text: USER_TEXT }],
      timestamp: 1787212028225,
    }
    const assistant = {
      role: 'assistant',
      content: [],
      api: 'anthropic-messages',
      provider: 'hub',
      model: 'deepseek-v4-flash-free',
      stopReason: errorMessage ? 'error' : 'stop',
      timestamp: 1787212028260,
      errorMessage,
    }
    return [
      { type: 'response', command: 'prompt', success: true },
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'message_start', message: user },
      { type: 'message_end', message: user },
      { type: 'message_start', message: assistant },
      { type: 'message_end', message: assistant },
      { type: 'turn_end', message: assistant, toolResults: [] },
      { type: 'agent_end', messages: [user, assistant], willRetry: false },
      { type: 'agent_settled' },
    ]
  }

  const SCENARIOS = [
    { name: '正常一轮', error: null, expect: { prompts: 1, userBubbles: 1 } },
    {
      name: '命令送不到 pi',
      failSend: true,
      error: null,
      // 送不到就没有回传，全靠本地回显撑住，所以仍必须看得见自己发过什么
      expect: { prompts: 1, userBubbles: 1, contains: '会话尚未启动' },
    },
    {
      name: '上游 429 免费额度耗尽',
      error: '429: {"type":"FreeUsageLimitError","message":"Rate limit exceeded."}',
      expect: { prompts: 1, userBubbles: 1, contains: '已达免费额度上限（429）' },
    },
  ]

  /** 顶替 Tauri 桥接层：注册事件监听、应答命令、按需回放帧 */
  function installBridge({ FRAMES, failSend }) {
    const listeners = {}
    let seq = 1
    window.__E2E__ = { sent: [] }

    const emit = (event, payload) => listeners[event]?.({ event, payload, id: 0 })

    const handleSend = (p) => {
      window.__E2E__.sent.push(p)
      if (p.type === 'prompt' && failSend) throw new Error('会话尚未启动')

      // 非 prompt 命令必须立刻应答，否则 bootSession 挂住、界面永远停在骨架屏
      if (p.type !== 'prompt') {
        const data = { sessionName: '测试会话', messages: [] }
        setTimeout(
          () => emit('pi://message', { id: p.id, type: 'response', command: p.type, success: true, data }),
          10,
        )
        return
      }
      setTimeout(() => {
        for (const f of FRAMES) emit('pi://message', f.type === 'response' ? { ...f, id: p.id } : f)
      }, 30)
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
        // 其余命令给形状正确的空值——返回 null 会让界面在解构处直接崩掉
        if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
        if (cmd === 'read_models_config') return { providers: [] }
        if (cmd === 'read_app_settings') return {}
        if (cmd === 'read_git_diff' || cmd === 'read_git_diff_stat') return ''
        return null
      },
    }
  }

  async function runScenario(page, scenario) {
    await page.addInitScript(installBridge, {
      FRAMES: framesFor(scenario.error),
      failSend: Boolean(scenario.failSend),
    })

    await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const project = page.getByText('e2e-项目', { exact: true }).first()
    if (await project.count()) {
      await project.click()
      await page.waitForTimeout(700)
    }

    const input = page.locator('textarea').first()
    await input.click()
    await input.fill(USER_TEXT)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)

    const sent = await page.evaluate(() => window.__E2E__.sent)
    const text = await page.locator('main').innerText()
    const actual = {
      prompts: sent.filter((s) => s.type === 'prompt').length,
      userBubbles: (text.match(new RegExp(USER_TEXT, 'g')) || []).length,
    }

    const failures = Object.entries(scenario.expect)
      .filter(([key, want]) => (key === 'contains' ? !text.includes(want) : actual[key] !== want))
      .map(([key, want]) => `${key} 期望 ${want}，实际 ${key === 'contains' ? '缺失' : actual[key]}`)

    return {
      场景: scenario.name,
      结果: failures.length ? '✗ ' + failures.join('；') : '✓ 通过',
      ...actual,
      正文: text.replace(/\n/g, ' / ').slice(0, 160),
    }
  }

  const results = []
  for (const scenario of SCENARIOS) results.push(await runScenario(page, scenario))
  return results
}
