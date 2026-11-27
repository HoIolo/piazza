/*
 * 生成 README 用的界面截图。
 *
 * 和 e2e/ 下其它探针一样：真实前端 + 桩桥接，只是这里不断言，只出图。
 * 前提：vite dev 跑在 1420。跑法：Playwright run_code 指向本文件。
 *
 * 输出：docs/screenshot.png
 */

/* run_code 要求整个文件是单个表达式，所以定义全部收在函数体内 */
async (initialPage) => {
  const context = await initialPage
    .context()
    .browser()
    .newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  const page = await context.newPage()

  await page.addInitScript(() => {
    const listeners = {}
    let seq = 1
    const T0 = 1787212028225

    const model = {
      id: 'claude-sonnet-4.6',
      name: 'Sonnet 4.6',
      api: 'anthropic-messages',
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      reasoning: true,
      input: ['text', 'image'],
      contextWindow: 200000,
      maxTokens: 8192,
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    }

    const state = {
      model,
      thinkingLevel: 'medium',
      sessionId: 'readme',
      sessionName: '按 provider 分组模型',
    }

    const PROMPT = '把设置里的模型卡片改成按 provider 分组，切换模型时保留每个模型自己的推理强度。'
    const COMMAND = 'rg -n "byProvider|provider" src/shared/components/ModelPicker'

    const text = (value) => [{ type: 'text', text: value }]
    const assistant = (content, extra) => ({
      role: 'assistant',
      content,
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'claude-sonnet-4.6',
      timestamp: T0,
      ...extra,
    })

    const FINAL = assistant(
      [
        {
          type: 'text',
          text: '分组逻辑已经在 `useModelOptions` 里了，问题在选择器的**状态没有按模型存**：切回来时读的是全局 `thinkingLevel`。\n\n改成 `Record<modelId, ThinkingLevel>`，写回 `settings.json` 时保留未知字段：\n\n- `useModelOptions` 只负责分组与排序\n- 选择器读写按 modelId 索引，旧配置回退到全局值\n- 落盘仍走原来的备份 + 原子替换\n\n`typecheck` 与 `lint` 都过了，顺手补了三条覆盖旧配置迁移的用例。',
        },
      ],
      { usage: { input: 18420, output: 962, cacheRead: 12980, cacheWrite: 0 }, stopReason: 'stop' },
    )

    /* 真实 rpc 帧：工具调用一轮 + 结论一轮 */
    const FRAMES = [
      { type: 'agent_start' },
      { type: 'turn_start' },
      { type: 'message_start', message: { role: 'user', content: text(PROMPT), timestamp: T0 } },
      { type: 'message_end', message: { role: 'user', content: text(PROMPT), timestamp: T0 } },
      {
        type: 'message_start',
        message: assistant(
          [
            {
              type: 'thinking',
              thinking:
                '先看分组逻辑落在哪一层。分组要在 store 里做，别放进组件——否则侧边聊天那个选择器会不一致。',
            },
            { type: 'toolCall', id: 'call_1', name: 'bash', arguments: { command: COMMAND } },
          ],
          { stopReason: 'toolUse' },
        ),
      },
      { type: 'tool_execution_start', toolCallId: 'call_1', toolName: 'bash', args: { command: COMMAND } },
      {
        type: 'tool_execution_end',
        toolCallId: 'call_1',
        toolName: 'bash',
        isError: false,
        result: {
          content: text(
            'useModelOptions.ts:12:  const groups = byProvider(models)\nuseModelOptions.ts:28:  return groups',
          ),
        },
      },
      {
        type: 'message_end',
        message: assistant(
          [
            { type: 'thinking', thinking: '分组已经有了，缺的是按模型存推理强度。' },
            { type: 'toolCall', id: 'call_1', name: 'bash', arguments: { command: COMMAND } },
          ],
          { stopReason: 'toolUse' },
        ),
      },
      { type: 'turn_end' },
      { type: 'turn_start' },
      { type: 'message_start', message: FINAL },
      { type: 'message_end', message: FINAL },
      { type: 'turn_end' },
      { type: 'agent_end', willRetry: false },
      { type: 'agent_settled' },
    ]

    const emit = (frame) =>
      listeners['pi://message']?.({ event: 'pi://message', id: 0, payload: { slotId: 'default', payload: frame } })

    const session = (id, title, ms) => ({
      id,
      path: `/Users/dev/piazza/.sessions/${id}.jsonl`,
      title,
      timestamp: new Date(ms).toISOString(),
      modifiedMs: ms,
      createdMs: ms,
    })

    const dataFor = (type) => {
      if (type === 'get_messages') return { messages: [] }
      if (type === 'get_available_models') return { models: [model] }
      if (type === 'get_available_thinking_levels')
        return { levels: ['off', 'low', 'medium', 'high', 'xhigh'] }
      if (type === 'get_commands') return { commands: [] }
      if (type === 'get_session_stats') return { totalTokens: 18420, contextWindow: 200000 }
      return { ...state }
    }

    const handle = (payload) => {
      if (payload.type === 'prompt') {
        emit({ id: payload.id, type: 'response', command: 'prompt', success: true })
        let delay = 80
        for (const frame of FRAMES) {
          setTimeout(() => emit(frame), delay)
          delay += frame.type === 'message_start' ? 60 : 320
        }
        return
      }
      setTimeout(
        () =>
          emit({
            id: payload.id,
            type: 'response',
            command: payload.type,
            success: true,
            data: dataFor(payload.type),
          }),
        10,
      )
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
        if (cmd === 'rpc_send') return handle(args.payload)
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions')
          return [
            {
              cwd: '/Users/dev/piazza',
              name: 'piazza',
              latestMs: T0,
              sessions: [
                session('readme', '按 provider 分组模型', T0),
                session('s2', '侧边聊天的模型选择', T0 - 36e5),
                session('s3', '终端标签随手切换', T0 - 864e5),
              ],
            },
            {
              cwd: '/Users/dev/acme-web',
              name: 'acme-web',
              latestMs: T0 - 1728e5,
              sessions: [session('s4', '升级到 React 19.2', T0 - 1728e5)],
            },
          ]
        if (cmd === 'read_app_settings') return { theme: 'dark' }
        if (cmd === 'read_models_config') return { providers: [] }
        if (cmd === 'read_git_branch') return 'main'
        if (cmd === 'read_git_diff_stat') return [7, 23]
        if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
        if (cmd === 'read_git_diff') return ''
        return null
      },
    }
  })

  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)

  const input = page.locator('textarea').first()
  await input.fill('把设置里的模型卡片改成按 provider 分组，切换模型时保留每个模型自己的推理强度。')
  await input.press('Enter')
  await page.waitForTimeout(5000)

  await page.screenshot({ path: 'docs/screenshot.png' })
  const stats = await page.evaluate(() => ({
    showsAnswer: document.body.innerHTML.includes('Record&lt;modelId'),
    label: document.querySelector('[title="选择模型"]')?.textContent ?? null,
  }))
  await context.close()
  return stats
}
