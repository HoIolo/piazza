/* Codex 对齐回归：默认模型、附件 RPC、失败恢复、图片预览和工具展开。仅模拟 Tauri / pi 桥接。 */
async (initialPage) => {
  const context = await initialPage
    .context()
    .browser()
    .newContext({ viewport: { width: 1200, height: 791 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const check = (condition, message) => {
    if (!condition) throw new Error(message)
  }
  await page.addInitScript(() => {
    window.isTauri = true
    const listeners = {}
    let callback = 1
    let settings = {}
    const models = [
      { id: 'vision', name: 'Vision', provider: 'test', reasoning: true, input: ['text', 'image'] },
      { id: 'text', name: 'Text', provider: 'test', reasoning: true, input: ['text'] },
    ]
    let state = {
      model: models[0],
      thinkingLevel: 'medium',
      sessionId: 'test',
      sessionName: '附件与工具对齐',
    }
    window.__QA__ = { sent: [], starts: [], settings: [], fail: false, models }
    const emit = (event, payload) =>
      listeners[event]?.forEach((handler) => handler({ payload, event, id: 0 }))
    window.__QA__.emit = (payload) => emit('pi://message', payload)
    window.__QA__.drop = (payload) => emit('tauri://drag-drop', payload)
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback(fn) {
        const id = callback++
        window[`_${id}`] = fn
        return id
      },
      async invoke(command, args = {}) {
        if (command === 'plugin:event|listen') {
          ;(listeners[args.event] ??= []).push(window[`_${args.handler}`])
          return callback++
        }
        if (command === 'rpc_start') {
          window.__QA__.starts.push(args.opts)
          state = {
            ...state,
            model: models.find((model) => model.id === args.opts.model) ?? models[0],
            thinkingLevel: 'off',
          }
          return null
        }
        if (command === 'rpc_send') {
          const payload = args.payload
          window.__QA__.sent.push(payload)
          if (payload.type === 'set_model')
            state.model = models.find((model) => model.id === payload.modelId)
          if (payload.type === 'set_thinking_level') state.thinkingLevel = payload.level
          let data = { ...state }
          if (payload.type === 'get_available_models') data = { models }
          if (payload.type === 'get_available_thinking_levels')
            data = { levels: ['off', 'low', 'medium', 'high'] }
          if (payload.type === 'get_messages') data = { messages: [] }
          const fail = window.__QA__.fail && ['prompt', 'steer', 'follow_up'].includes(payload.type)
          setTimeout(
            () =>
              emit('pi://message', {
                id: payload.id,
                type: 'response',
                command: payload.type,
                success: !fail,
                data,
                error: fail ? '模拟发送失败' : undefined,
              }),
            15,
          )
          return null
        }
        if (command === 'scan_sessions')
          return [{ cwd: '/tmp/alignment', name: 'piazza', latestMs: Date.now(), sessions: [] }]
        if (command === 'read_app_settings') return settings
        if (command === 'write_app_settings') {
          settings = { ...settings, ...args.patch }
          window.__QA__.settings.push(settings)
          return settings
        }
        if (command === 'read_models_config') return { providers: {} }
        if (command === 'rpc_is_running') return true
        if (command === 'store_attachment')
          return {
            name: args.name,
            path: `/tmp/${args.name}`,
            size: args.data.length,
            mimeType: args.name.endsWith('.png') ? 'image/png' : null,
            data: args.name.endsWith('.png') ? args.data : null,
          }
        if (command === 'read_attachment')
          return {
            name: 'preview.png',
            path: args.path,
            size: 100,
            mimeType: 'image/png',
            data: window.__QA__.png,
          }
        if (command === 'read_git_diff_stat') return [10, 3]
        if (command === 'read_git_branch') return 'main'
        if (command.startsWith('list_') || command === 'search_project_files') return []
        return null
      },
    }
  })
  await page.goto('http://localhost:1420/')
  await page.getByTitle('选择模型').waitFor()
  await page.waitForFunction(() => !document.querySelector('[title="选择模型"]').disabled)
  const out = {}
  const input = page.locator('textarea').first()
  const send = page.locator('button[data-action="send"]')
  await page.getByTitle('选择模型').click()
  check(
    (await page.getByText('设为新会话默认', { exact: true }).count()) === 0,
    '不应出现手动设默认入口',
  )
  const range = page.locator('input[type=range]')
  await range.focus()
  await page.keyboard.press('End')
  await page.waitForFunction(() =>
    window.__QA__.settings.some((value) => value.defaultThinkingLevel === 'high'),
  )
  await page.keyboard.press('Escape')
  await page
    .getByRole('button', { name: /新对话/ })
    .first()
    .click()
  await page.waitForFunction(() => window.__QA__.starts.length >= 2)
  await page.waitForFunction(() =>
    document.querySelector('[title="选择模型"]').innerText.includes('高'),
  )
  out.inheritedModel = await page.evaluate(() => window.__QA__.starts.at(-1).model)
  check(out.inheritedModel === 'vision', '新会话没有继承当前模型')
  await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 140
    const drawing = canvas.getContext('2d')
    drawing.fillStyle = '#e8f0fc'
    drawing.fillRect(0, 0, 240, 140)
    drawing.fillStyle = '#285080'
    drawing.font = '20px sans-serif'
    drawing.fillText('Image preview', 40, 78)
    window.__QA__.png = canvas.toDataURL('image/png').split(',')[1]
    const bytes = Uint8Array.from(atob(window.__QA__.png), (character) => character.charCodeAt(0))
    const clipboard = new DataTransfer()
    clipboard.items.add(new File([bytes], 'clipboard.png', { type: 'image/png' }))
    document
      .querySelector('textarea')
      .dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
      )
  })
  await page.getByRole('button', { name: '移除附件：clipboard.png', exact: true }).waitFor()
  check((await input.inputValue()) === '', '图片粘贴不应注入文件名文本')
  await page.getByRole('button', { name: '查看图片：clipboard.png' }).click()
  await page.getByRole('button', { name: '放大图片' }).click()
  check(
    (await page.getByRole('button', { name: '重置图片缩放' }).innerText()) === '125%',
    '图片缩放失败',
  )
  await page.keyboard.press('Escape')
  check((await page.getByRole('dialog').count()) === 0, 'Escape 没有关闭图片预览')
  await send.click()
  await page.waitForFunction(() =>
    window.__QA__.sent.some((value) => value.type === 'prompt' && value.images?.length === 1),
  )
  out.imageOnlyPrompt = await page.evaluate(() => {
    const prompt = window.__QA__.sent.find((value) => value.type === 'prompt')
    return { text: prompt.message, images: prompt.images.length, mime: prompt.images[0].mimeType }
  })
  await page.waitForFunction(() => !document.querySelector('[aria-label="消息附件"]'))
  await input.evaluate((element) => {
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', '粘贴内容\n'.repeat(400))
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
    )
  })
  await page.getByRole('button', { name: '移除附件：粘贴文本' }).waitFor()
  await page.getByRole('button', { name: /粘贴文本.*字符/ }).click()
  await page.getByRole('button', { name: '在输入框中显示' }).click()
  check((await input.inputValue()).includes('粘贴内容'), '长文本未能还原到输入框')
  await input.fill('')
  await page.evaluate(() => {
    window.isTauri = false
  })
  await input.evaluate((element) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File(['const fixture = 42'], 'example.ts', { type: 'text/plain' }))
    element.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }))
  })
  await page.getByRole('button', { name: '移除附件：example.ts' }).waitFor()
  await page.evaluate(() => {
    window.__QA__.fail = true
  })
  await input.fill('发送失败要保留附件')
  await send.click()
  await page.getByRole('button', { name: '移除附件：example.ts' }).waitFor()
  await page.waitForFunction(
    () => document.querySelector('textarea').value === '发送失败要保留附件',
  )
  out.failedDraftRestored = true
  await page.evaluate(() => {
    window.__QA__.fail = false
    window.__QA__.emit({ type: 'agent_start' })
    window.__QA__.emit({ type: 'agent_settled' })
  })
  await send.click()
  await page.waitForFunction(() => !document.querySelector('[aria-label="消息附件"]'))
  out.fileSentWithContent = await page.evaluate(() =>
    window.__QA__.sent.some(
      (value) => value.type === 'prompt' && value.message.includes('const fixture = 42'),
    ),
  )
  check(out.fileSentWithContent, '文件内容没有发送到 RPC')
  await page.evaluate(() => {
    const image = { type: 'image', mimeType: 'image/png', data: window.__QA__.png }
    const content = [
      { type: 'toolCall', id: 'image-tool', name: 'read', arguments: { path: '/tmp/preview.png' } },
      { type: 'text', text: '已检查图片。\n\n![本地图片](/tmp/preview.png)' },
    ]
    const emit = window.__QA__.emit
    emit({ type: 'agent_start' })
    emit({
      type: 'message_end',
      message: { role: 'user', content: '查看图片并读取文件', timestamp: Date.now() },
    })
    emit({
      type: 'tool_execution_start',
      toolCallId: 'image-tool',
      toolName: 'read',
      args: { path: '/tmp/preview.png' },
    })
    emit({
      type: 'tool_execution_end',
      toolCallId: 'image-tool',
      toolName: 'read',
      result: { content: [image] },
      isError: false,
    })
    emit({
      type: 'message_end',
      message: { role: 'assistant', content, timestamp: Date.now(), stopReason: 'stop' },
    })
    emit({ type: 'agent_settled' })
  })
  const tool = page.locator('[data-tool-call="image-tool"]')
  await tool.getByRole('button', { name: /已查看 1 张图像/ }).click()
  await tool.getByRole('button', { name: '查看图片：已查看的图像 1' }).click()
  await page.getByRole('dialog').waitFor()
  out.imageOnlyToolPreview = true
  out.imageThumbnailSize = await tool.locator('img').first().evaluate((image) => ({width: image.parentElement.getBoundingClientRect().width, height: image.parentElement.getBoundingClientRect().height}))
  check(out.imageThumbnailSize.width === 80 && out.imageThumbnailSize.height === 80, '查看图像的缩略图应为 80px')
  check(await tool.getByText('执行完成', {exact: true}).count() === 0, '图片查看不应出现状态卡片')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '查看图片：本地图片' }).waitFor()
  await page.getByRole('button', { name: '切换右侧面板', exact: true }).click()
  const launcher = page.getByRole('menu', { name: '新标签页', exact: true })
  await launcher.waitFor()
  out.launcherLabels = await launcher.getByRole('menuitem').allInnerTexts()
  out.launcherCardBorders = await launcher
    .getByRole('menuitem')
    .first()
    .evaluate((element) => getComputedStyle(element).borderTopWidth)
  check(out.launcherCardBorders === '0px', '右侧入口仍是带边框的大卡片')
  out.horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  )
  await page.waitForTimeout(500)
  await tool.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/.shots/codex-alignment-2400x1582.png' })
  await input.evaluate((element) => {
    window.isTauri = true
    const bounds = element.getBoundingClientRect()
    window.__QA__.drop({
      paths: ['/tmp/native.png'],
      position: {
        x: (bounds.left + 20) * devicePixelRatio,
        y: (bounds.top + 10) * devicePixelRatio,
      },
    })
  })
  await page.getByRole('button', { name: '移除附件：preview.png' }).waitFor()
  out.nativeDropReceived = true
  await page.getByRole('button', { name: '移除附件：preview.png' }).click()
  await page.getByTitle('选择模型').click()
  await page.getByRole('button', { name: '选择模型', exact: true }).last().click()
  await page.getByRole('menuitemradio', { name: /Text/ }).click()
  await page.waitForFunction(() =>
    window.__QA__.settings.some((value) => value.defaultModel === 'text'),
  )
  await page.keyboard.press('Escape')
  await input.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    window.__QA__.drop({
      paths: ['/tmp/native.png'],
      position: {
        x: (bounds.left + 20) * devicePixelRatio,
        y: (bounds.top + 10) * devicePixelRatio,
      },
    })
  })
  await page.getByRole('button', { name: '移除附件：preview.png' }).waitFor()
  const promptsBefore = await page.evaluate(
    () => window.__QA__.sent.filter((value) => value.type === 'prompt').length,
  )
  await send.click()
  await page
    .getByText('当前模型不支持图片输入，请选择支持图片的模型后发送。', { exact: true })
    .waitFor()
  const promptsAfter = await page.evaluate(
    () => window.__QA__.sent.filter((value) => value.type === 'prompt').length,
  )
  check(promptsBefore === promptsAfter, '文本模型不应收到图片')
  out.textOnlyModelGuarded = true
  await context.close()
  return out
}
