/*
 * 模型设置页探针。
 *
 * 页面只是概览，增改都在对话框里、按保存即写 models.json。要盯住：
 *   1. 概览卡片把 provider / 模型列成人能读的样子（名字、API、上下文标签）
 *   2. 「添加自定义服务商」→ 填表 → 保存：write_models_config 收到的 patch 里有它，
 *      且空的 apiKey 不写进文件
 *   3. 「添加模型」→ 上下文选 400K → 保存：写入 contextWindow: 400000
 *   4. 编辑一个上下文不在预设里的模型：分段控件停在「自定义」，数值原样保留
 *   5. 删除走系统确认框（ask 在这版插件里是 plugin:dialog|message 的别名），
 *      取消则不写文件，确认才写
 *   6. 深色主题下对话框仍用令牌配色，不会出现白底黑字的原生外观
 *
 * 前提：vite dev 跑在 1420。跑法：Playwright run_code 指向本文件。
 */

async (page) => {
  await page.addInitScript(() => {
    const listeners = {}
    let seq = 1
    window.__E2E__ = { writes: [], asks: [], askAnswer: false }

    let config = {
      providers: {
        hub: {
          name: 'Hub',
          api: 'anthropic-messages',
          baseUrl: 'https://hub.example.com/anthropic',
          apiKey: 'sk-secret',
          compat: { keep: true },
          models: [
            { id: 'deepseek-v4', name: 'DeepSeek V4', reasoning: true, contextWindow: 262144, maxTokens: 32000 },
          ],
        },
      },
      futureKey: 42,
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
        if (cmd === 'plugin:dialog|message') {
          window.__E2E__.asks.push(args)
          // 原生框返回被点的按钮文案，ask 再拿它跟 okLabel 比对
          const [ok, cancel] = args.buttons?.OkCancelCustom ?? ['Yes', 'No']
          return window.__E2E__.askAnswer ? ok : cancel
        }
        if (cmd === 'read_models_config') return config
        if (cmd === 'write_models_config') {
          window.__E2E__.writes.push(JSON.parse(JSON.stringify(args.patch)))
          config = { ...config, ...args.patch }
          return config
        }
        if (cmd === 'read_app_settings') return {}
        if (cmd === 'rpc_is_running') return true
        if (cmd === 'scan_sessions') return []
        if (cmd.startsWith('list_') || cmd === 'search_project_files') return []
        return null
      },
    }
  })

  await page.setViewportSize({ width: 1200, height: 820 })
  await page.goto('http://localhost:1420/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await page.keyboard.press('Meta+,')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '模型与账号' }).click()
  await page.getByRole('radio', { name: '自定义服务商' }).click()
  await page.waitForTimeout(600)

  const 概览文本 = await page.locator('section').filter({ hasText: 'Hub' }).first().innerText()
  await page.screenshot({ path: '.playwright-mcp/models-overview.png' })

  // 2. 添加 provider
  await page.getByRole('button', { name: '添加自定义服务商' }).click()
  await page.waitForTimeout(300)
  await page.getByLabel('显示名称').fill('My Proxy')
  await page.getByLabel('标识').fill('my-proxy')
  await page.getByLabel('Base URL').fill('https://proxy.example.com/v1')
  await page.screenshot({ path: '.playwright-mcp/models-provider-dialog.png' })
  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(400)

  // 3. 给新 provider 添加模型，上下文选 400K
  const 新卡片 = page.locator('section').filter({ hasText: 'My Proxy' }).first()
  await 新卡片.getByRole('button', { name: '添加模型' }).click()
  await page.waitForTimeout(300)
  await page.getByLabel('模型 ID').fill('gpt-5.5')
  await page.getByRole('radio', { name: '400K' }).click()
  await page.getByLabel('支持推理').click()
  await page.screenshot({ path: '.playwright-mcp/models-model-dialog.png' })
  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(400)

  // 4. 编辑预设外的模型：应停在「自定义」并保留 262144
  await page.getByRole('button', { name: '编辑模型 DeepSeek V4' }).click()
  await page.waitForTimeout(300)
  const 自定义选中 = await page.getByRole('radio', { name: '自定义' }).getAttribute('aria-checked')
  const 自定义值 = await page.getByLabel('自定义上下文窗口').inputValue()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const 对话框已关 = (await page.getByRole('dialog').count()) === 0
  const 设置还在 = await page.getByRole('heading', { name: '模型与账号' }).isVisible()

  // 5. 删除：取消不写；确认才写
  await page.getByRole('button', { name: '删除模型 DeepSeek V4' }).click()
  await page.waitForTimeout(300)
  const 写入数_取消前 = await page.evaluate(() => window.__E2E__.writes.length)
  await page.evaluate(() => (window.__E2E__.askAnswer = true))
  await page.getByRole('button', { name: '删除模型 DeepSeek V4' }).click()
  await page.waitForTimeout(400)

  const e2e = await page.evaluate(() => window.__E2E__)
  await page.screenshot({ path: '.playwright-mcp/models-after.png' })

  // 6. 深色主题：打开编辑对话框截图，肉眼核对配色
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await page.getByRole('button', { name: '编辑模型 gpt-5.5' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: '.playwright-mcp/models-dialog-dark.png' })
  await page.keyboard.press('Escape')

  return {
    概览文本,
    写入次数: e2e.writes.length,
    写入1_新provider: e2e.writes[0]?.providers?.['my-proxy'],
    写入1_保留未知字段: e2e.writes[0]?.futureKey === 42 && e2e.writes[0]?.providers?.hub?.compat?.keep === true,
    写入2_新模型: e2e.writes[1]?.providers?.['my-proxy']?.models,
    自定义选中,
    自定义值,
    对话框已关,
    设置还在,
    询问次数: e2e.asks.length,
    询问标题: e2e.asks[0]?.title,
    取消时未写入: 写入数_取消前 === 2,
    写入3_删除后hub模型数: e2e.writes[2]?.providers?.hub?.models?.length,
  }
}
